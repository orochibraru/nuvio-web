import { browser } from "$app/env";
import { DOWNLOADS_DIR, localMediaUrl } from "./files.ts";
import { deleteDownload, listDownloads, putDownload } from "./store.ts";
import type {
	DownloadRecord,
	NewDownload,
	WorkerCommand,
	WorkerEvent,
} from "./types.ts";

/**
 * The page side of downloads: the reactive list for the current profile, and
 * the queue that feeds the worker one download at a time.
 *
 * One at a time on purpose : a single download saturates most connections, and
 * a finished title beats three half-finished ones when the train goes into the
 * tunnel. A download interrupted by closing the tab is `downloading` in
 * IndexedDB with nobody working on it; `attach` puts it back in the queue and
 * the worker resumes it from what is already on disk.
 */

/** The profile whose downloads the offline page lists (no session there). */
const LAST_OWNER_KEY = "nuvio:downloads-owner";

export function lastDownloadsOwner(): string | null {
	try {
		return localStorage.getItem(LAST_OWNER_KEY);
	} catch {
		return null;
	}
}

async function removeFiles(id: string): Promise<void> {
	try {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle(DOWNLOADS_DIR);
		await dir.removeEntry(id, { recursive: true });
	} catch {
		// Nothing on disk yet, or already gone.
	}
}

/** Where a finished download plays from : the service worker serves it. */
export function playbackUrl(record: DownloadRecord): string | null {
	return record.status === "done" && record.entry
		? localMediaUrl(record.id, record.entry)
		: null;
}

class DownloadManager {
	items = $state<DownloadRecord[]>([]);
	ready = $state(false);

	#owner: string | null = null;
	#worker: Worker | null = null;
	#active: string | null = null;
	/** Subtitle sources wait here until the worker plans the download. */
	readonly #subtitles = new Map<string, NewDownload["subtitleSources"]>();
	/** Resolved when the worker lets go of a download (see `remove`). */
	readonly #released = new Map<string, () => void>();

	get supported(): boolean {
		return (
			browser &&
			"storage" in navigator &&
			typeof navigator.storage.getDirectory === "function" &&
			typeof Worker !== "undefined"
		);
	}

	async attach(owner: string): Promise<void> {
		if (!this.supported || owner === this.#owner) {
			return;
		}
		this.#owner = owner;
		try {
			localStorage.setItem(LAST_OWNER_KEY, owner);
		} catch {
			// Storage blocked : the offline page just won't list anything.
		}
		const rows = await listDownloads(owner);
		if (owner !== this.#owner) {
			return;
		}
		for (const row of rows) {
			if (row.status === "downloading") {
				row.status = "queued";
			}
		}
		this.items = rows;
		this.ready = true;
		this.#pump();
	}

	/** Sign-out: stop working and forget whose downloads the offline page shows. */
	forget(): void {
		this.#worker?.terminate();
		this.#worker = null;
		this.#active = null;
		this.#owner = null;
		this.items = [];
		this.ready = false;
		try {
			localStorage.removeItem(LAST_OWNER_KEY);
		} catch {
			// no-op : storage unavailable
		}
	}

	/** The download of one video (a movie, or one episode), if any. */
	find(videoId: string): DownloadRecord | undefined {
		return this.items.find((item) => item.videoId === videoId);
	}

	async add(input: NewDownload): Promise<void> {
		const owner = this.#owner;
		if (!owner || this.find(input.videoId)) {
			return;
		}
		// Ask once for storage the browser won't evict under pressure; a no
		// on its own changes nothing.
		void navigator.storage.persist?.().catch(() => false);
		const { subtitleSources, ...fields } = input;
		const record: DownloadRecord = {
			...fields,
			id: crypto.randomUUID(),
			owner,
			kind: null,
			entry: null,
			mimeType: null,
			status: "queued",
			error: null,
			bytes: 0,
			totalBytes: null,
			filesDone: 0,
			filesTotal: null,
			subtitles: [],
			createdAt: Date.now(),
			completedAt: null,
		};
		this.#subtitles.set(record.id, subtitleSources);
		this.items.unshift(record);
		await putDownload(record);
		this.#pump();
	}

	pause(id: string): void {
		if (this.#active === id) {
			this.#send({ type: "abort", id });
			return;
		}
		this.#patch(id, { status: "paused" });
	}

	resume(id: string): void {
		this.#patch(id, { status: "queued", error: null });
		this.#pump();
	}

	async remove(id: string): Promise<void> {
		if (this.#active === id) {
			// The worker holds open handles on the files until it stops.
			const released = new Promise<void>((resolve) => {
				this.#released.set(id, resolve);
			});
			this.#send({ type: "abort", id });
			await released;
		}
		this.items = this.items.filter((item) => item.id !== id);
		this.#subtitles.delete(id);
		await removeFiles(id);
		await deleteDownload(id);
	}

	#patch(id: string, patch: Partial<DownloadRecord>): void {
		const item = this.items.find((row) => row.id === id);
		if (!item) {
			return;
		}
		Object.assign(item, patch);
		void putDownload($state.snapshot(item) as DownloadRecord);
	}

	#send(command: WorkerCommand): void {
		if (!this.#worker) {
			this.#worker = new Worker(
				new URL("./download.worker.ts", import.meta.url),
				{ type: "module" },
			);
			this.#worker.addEventListener(
				"message",
				(event: MessageEvent<WorkerEvent>) => this.#receive(event.data),
			);
		}
		this.#worker.postMessage(command);
	}

	/** Oldest queued first, so the queue runs in the order it was filled. */
	#pump(): void {
		if (this.#active) {
			return;
		}
		const next = this.items.findLast((item) => item.status === "queued");
		if (!next) {
			return;
		}
		this.#active = next.id;
		this.#patch(next.id, { status: "downloading" });
		this.#send({
			type: "start",
			record: $state.snapshot(next) as DownloadRecord,
			subtitleSources: this.#subtitles.get(next.id) ?? [],
		});
	}

	#receive(event: WorkerEvent): void {
		switch (event.type) {
			case "progress":
				this.#patch(event.id, event.patch);
				return;
			case "done":
				this.#patch(event.id, event.patch);
				this.#subtitles.delete(event.id);
				break;
			case "failed":
				this.#patch(event.id, { status: "error", error: event.error });
				break;
			case "aborted":
				this.#patch(event.id, { status: "paused" });
				break;
			default:
				return;
		}
		if (this.#active === event.id) {
			this.#active = null;
		}
		this.#released.get(event.id)?.();
		this.#released.delete(event.id);
		this.#pump();
	}
}

export const downloads = new DownloadManager();
