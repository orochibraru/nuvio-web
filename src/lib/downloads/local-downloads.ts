import {
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	statfs,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pinnedFetch, safeFetch } from "#lib/server/safe-fetch.js";
import type { Logger } from "#lib/services/logger.service.js";
import {
	downloadName,
	subtitleName,
	uniqueName,
	videoExtension,
} from "./disk-names.ts";
import { isLocalFile, PLAN_FILE } from "./files.ts";
import {
	Aborted,
	checkRoom,
	type Disk,
	runDownload,
	type SourceFetch,
} from "./job.ts";
import type { DownloadRecord, NewDownload, WorkerEvent } from "./types.ts";

/**
 * Downloads kept in a folder on this computer, fetched by this server: the
 * desktop app's, which sets `NUVIO_DOWNLOADS_DIR`. Real files the user can see,
 * that any player (mpv included) can open, with no browser quota and nothing
 * tied to the window's origin.
 *
 * Each download is a folder named after the title, holding the video named the
 * same (`media` while it downloads), its subtitles beside it, and two hidden
 * files: the download's plan and its record (what the Downloads page lists),
 * so the folder describes itself. One at a time, like the browser's queue; one
 * left `downloading` when the app quit picks up where it stopped on the next
 * start.
 */

const RECORD_FILE = ".nuvio.json";
const HIDDEN_PLAN = ".nuvio-plan.json";
/** What the first builds wrote, in a folder named by the id: moved on load. */
const LEGACY_RECORD = "record.json";

/** An addon URL through the SSRF guard, like the browser's download proxy. */
const guardedFetch: SourceFetch = async (url, plan, signal, range = null) => {
	const headers: Record<string, string> = { ...plan.requestHeaders };
	if (range) {
		headers.range = `bytes=${range.start}-${range.end ?? ""}`;
	}
	try {
		return await safeFetch(
			url,
			pinnedFetch,
			{ signal, headers },
			{ allowHttp: true },
		);
	} catch (error) {
		if (signal.aborted) {
			throw new Aborted();
		}
		throw error;
	}
};

/** A download's directory as a `Disk`; `folder` is where free space is measured. */
export function folderDisk(directory: string, folder: string): Disk {
	const at = (path: string) =>
		join(directory, path === PLAN_FILE ? HIDDEN_PLAN : path);
	return {
		readText: (path) => readFile(at(path), "utf8").catch(() => null),
		size: (path) =>
			stat(at(path)).then(
				(info) => info.size,
				() => 0,
			),
		async writeWhole(path, data) {
			await mkdir(dirname(at(path)), { recursive: true });
			await writeFile(at(path), data);
			return typeof data === "string"
				? Buffer.byteLength(data)
				: data.byteLength;
		},
		async open(path) {
			await mkdir(dirname(at(path)), { recursive: true });
			// Positioned writes: `r+` keeps what a paused download already has.
			const handle = await open(at(path), "r+").catch(() =>
				open(at(path), "w+"),
			);
			return {
				write: async (data, position) => {
					await handle.write(data, 0, data.byteLength, position);
				},
				truncate: (size) => handle.truncate(size),
				close: () => handle.close(),
			};
		},
		async ensureRoom(bytes) {
			// A system that won't say how much is free doesn't stop the download.
			const info = await statfs(folder).catch(() => null);
			if (info) {
				checkRoom(bytes, info.bavail * info.bsize);
			}
		},
	};
}

export class LocalDownloads {
	#loading: Promise<Map<string, DownloadRecord>> | null = null;
	/** Once the folder is read: every download, by id. */
	#records: Map<string, DownloadRecord> | null = null;
	#active: {
		id: string;
		controller: AbortController;
		finished: Promise<void>;
	} | null = null;
	/** Subtitle sources wait here until the download is planned. */
	readonly #subtitles = new Map<string, NewDownload["subtitleSources"]>();
	/** Record writes, one after another: progress lands several times a second. */
	#saving = Promise.resolve();

	constructor(
		readonly folder: string,
		private readonly logger: Logger,
		private readonly fetchSource: SourceFetch = guardedFetch,
	) {}

	/** This owner's downloads, newest first. */
	async list(owner: string): Promise<DownloadRecord[]> {
		const records = await this.#load();
		return [...records.values()]
			.filter((record) => record.owner === owner)
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	/** Bytes free where the downloads go, or null when the system won't say. */
	async free(): Promise<number | null> {
		try {
			await mkdir(this.folder, { recursive: true });
			const info = await statfs(this.folder);
			return info.bavail * info.bsize;
		} catch {
			return null;
		}
	}

	async add(owner: string, input: NewDownload): Promise<void> {
		const records = await this.#load();
		const taken = [...records.values()].some(
			(record) => record.owner === owner && record.videoId === input.videoId,
		);
		if (taken) {
			return;
		}
		const { subtitleSources, ...fields } = input;
		const record: DownloadRecord = {
			...fields,
			id: crypto.randomUUID(),
			onDisk: true,
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
		record.folder = await this.#freeFolder(downloadName(record));
		records.set(record.id, record);
		this.#subtitles.set(record.id, subtitleSources);
		await mkdir(this.#dir(record), { recursive: true });
		this.#save(record);
		await this.#saving;
		this.#pump();
	}

	async pause(owner: string, id: string): Promise<void> {
		const record = await this.#own(owner, id);
		if (!record) {
			return;
		}
		if (this.#active?.id === id) {
			await this.#stop();
		} else if (record.status === "queued") {
			this.#patch(id, { status: "paused" });
		}
		await this.#saving;
	}

	async resume(owner: string, id: string): Promise<void> {
		const record = await this.#own(owner, id);
		if (!record || record.status === "done" || this.#active?.id === id) {
			return;
		}
		this.#patch(id, { status: "queued", error: null });
		await this.#saving;
		this.#pump();
	}

	async remove(owner: string, id: string): Promise<void> {
		const record = await this.#own(owner, id);
		if (!record) {
			return;
		}
		if (this.#active?.id === id) {
			// The job holds open handles on the files until it stops.
			await this.#stop();
		}
		(await this.#load()).delete(id);
		this.#subtitles.delete(id);
		await this.#saving;
		await rm(this.#dir(record), { recursive: true, force: true });
	}

	/**
	 * A finished download's file, for this owner only: its path and recorded
	 * type. Only the files its record names (the video, its subtitles) or an
	 * HLS copy's own playlists and segments; never a hidden one.
	 */
	async file(
		owner: string,
		id: string,
		path: string,
	): Promise<{ path: string; mimeType: string | null } | null> {
		const record = await this.#own(owner, id);
		if (record?.status !== "done") {
			return null;
		}
		const named =
			path === record.entry ||
			record.subtitles.some((subtitle) => subtitle.path === path);
		const hlsPart =
			record.kind === "hls" && isLocalFile(id, path) && !path.startsWith(".");
		if (!(named || hlsPart)) {
			return null;
		}
		return { path: join(this.#dir(record), path), mimeType: record.mimeType };
	}

	#dir(record: DownloadRecord): string {
		return join(this.folder, record.folder ?? record.id);
	}

	/** `name`, numbered when another download or anything else already has it. */
	async #freeFolder(name: string): Promise<string> {
		const used = new Set(
			[...(this.#records?.values() ?? [])].map((record) => record.folder),
		);
		const present = new Set(
			await readdir(this.folder).catch(() => [] as string[]),
		);
		return uniqueName(name, (candidate) => {
			const key = candidate.toLowerCase();
			return [...used, ...present].some(
				(taken) => taken?.toLowerCase() === key,
			);
		});
	}

	/**
	 * A finished download, named like a library's: the folder after the title
	 * (an id-named one from the first builds), the video after it with the
	 * extension its bytes say, the subtitles beside it; the plan, done with, goes.
	 */
	async #name(record: DownloadRecord): Promise<Partial<DownloadRecord>> {
		const patch: Partial<DownloadRecord> = {};
		if (!record.folder || record.folder === record.id) {
			const folder = await this.#freeFolder(downloadName(record));
			await rename(join(this.folder, record.id), join(this.folder, folder));
			patch.folder = folder;
		}
		const base = (patch.folder ?? record.folder) as string;
		const dir = join(this.folder, base);
		if (record.kind === "file" && record.entry === "media") {
			const handle = await open(join(dir, "media"), "r");
			const head = new Uint8Array(4096);
			const { bytesRead } = await handle.read(head, 0, head.length, 0);
			await handle.close();
			patch.entry = `${base}.${videoExtension(head.slice(0, bytesRead), record.sourceUrl)}`;
			await rename(join(dir, "media"), join(dir, patch.entry));
		} else if (record.kind === "hls" && record.entry === "index.m3u8") {
			patch.entry = `${base}.m3u8`;
			await rename(join(dir, "index.m3u8"), join(dir, patch.entry));
		}
		const placed = new Set<string>();
		const subtitles = [];
		for (const subtitle of record.subtitles) {
			if (subtitle.path) {
				subtitles.push(subtitle);
				continue;
			}
			const path = subtitleName(base, subtitle, (name) => placed.has(name));
			placed.add(path);
			// biome-ignore lint/performance/noAwaitInLoops: a few renames, once per download
			await rename(join(dir, "subs", subtitle.file), join(dir, path));
			subtitles.push({ ...subtitle, path });
		}
		patch.subtitles = subtitles;
		await rm(join(dir, "subs"), { recursive: true, force: true });
		await rm(join(dir, HIDDEN_PLAN), { force: true });
		await rm(join(dir, PLAN_FILE), { force: true });
		await rm(join(dir, LEGACY_RECORD), { force: true });
		return patch;
	}

	async #own(owner: string, id: string): Promise<DownloadRecord | null> {
		const record = (await this.#load()).get(id);
		return record?.owner === owner ? record : null;
	}

	/** Reads the folder once; a download cut off by a quit goes back in the queue. */
	#load(): Promise<Map<string, DownloadRecord>> {
		this.#loading ??= (async () => {
			await mkdir(this.folder, { recursive: true });
			const names = await readdir(this.folder).catch(() => [] as string[]);
			const found = await Promise.all(names.map((name) => this.#read(name)));
			const records = new Map<string, DownloadRecord>();
			for (const record of found) {
				if (record && !records.has(record.id)) {
					records.set(record.id, record);
				}
			}
			this.#records = records;
			await this.#nameUnnamed([...records.values()]);
			await this.#saving;
			queueMicrotask(() => this.#pump());
			return records;
		})();
		return this.#loading;
	}

	/** The download in folder `name`, if it is one. */
	async #read(name: string): Promise<DownloadRecord | null> {
		const dir = join(this.folder, name);
		const text =
			(await readFile(join(dir, RECORD_FILE), "utf8").catch(() => null)) ??
			(await readFile(join(dir, LEGACY_RECORD), "utf8").catch(() => null));
		try {
			const record = JSON.parse(text ?? "") as DownloadRecord;
			if (!isLocalFile(record.id, "media")) {
				return null;
			}
			record.folder = name;
			if (record.status === "downloading") {
				record.status = "queued";
			}
			return record;
		} catch {
			// Not a download, or one whose record didn't survive.
			return null;
		}
	}

	/** Downloads finished before files were named after the title: named now. */
	async #nameUnnamed(records: DownloadRecord[]): Promise<void> {
		for (const record of records) {
			if (record.status !== "done" || record.entry !== "media") {
				continue;
			}
			// biome-ignore lint/performance/noAwaitInLoops: one at a time, each takes a folder name the next must see as taken
			await this.#name(record).then(
				(patch) => this.#patch(record.id, patch),
				(error: unknown) => this.#nameFailed(record, error),
			);
		}
	}

	#patch(id: string, patch: Partial<DownloadRecord>): void {
		const record = this.#records?.get(id);
		if (record) {
			Object.assign(record, patch);
			this.#save(record);
		}
	}

	#nameFailed(record: DownloadRecord, error: unknown): void {
		this.logger.warn("Naming a finished download's files failed", {
			id: record.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	/** Written beside, then renamed over: a quit mid-write never loses a record. */
	#save(record: DownloadRecord): void {
		const file = join(this.#dir(record), RECORD_FILE);
		const text = JSON.stringify(record);
		this.#saving = this.#saving
			.then(async () => {
				await writeFile(`${file}.tmp`, text);
				await rename(`${file}.tmp`, file);
			})
			.catch((error: unknown) => {
				this.logger.warn("Saving a download's record failed", {
					id: record.id,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	}

	async #stop(): Promise<void> {
		const active = this.#active;
		active?.controller.abort();
		await active?.finished;
	}

	/** Oldest queued first, so the queue runs in the order it was filled. */
	#pump(): void {
		if (this.#active || !this.#records) {
			return;
		}
		const next = [...this.#records.values()]
			.filter((record) => record.status === "queued")
			.sort((a, b) => a.createdAt - b.createdAt)[0];
		if (!next) {
			return;
		}
		next.status = "downloading";
		this.#save(next);
		const controller = new AbortController();
		const outcome: { done: Partial<DownloadRecord> | null } = { done: null };
		const finished = runDownload(
			{
				record: { ...next },
				subtitleSources: this.#subtitles.get(next.id) ?? [],
			},
			{
				disk: folderDisk(this.#dir(next), this.folder),
				fetchSource: this.fetchSource,
				signal: controller.signal,
			},
			(event) => {
				if (event.type === "done") {
					outcome.done = event.patch;
				} else {
					this.#receive(event);
				}
			},
		).then(async () => {
			// Only named, never half-named, by the time it reads as done.
			const { done } = outcome;
			if (!done) {
				return;
			}
			this.#subtitles.delete(next.id);
			const finishing = { ...next, ...done };
			const named = await this.#name(finishing).catch((error: unknown) => {
				this.#nameFailed(finishing, error);
				return {};
			});
			this.#patch(next.id, { ...done, ...named });
		});
		this.#active = { id: next.id, controller, finished };
		void finished.then(() => {
			if (this.#active?.controller === controller) {
				this.#active = null;
			}
			this.#pump();
		});
	}

	#receive(event: WorkerEvent): void {
		switch (event.type) {
			case "progress":
				this.#patch(event.id, event.patch);
				return;
			case "failed":
				this.logger.warn("A download failed", {
					id: event.id,
					error: event.error,
				});
				this.#patch(event.id, { status: "error", error: event.error });
				return;
			case "aborted":
				this.#patch(event.id, { status: "paused" });
				return;
			default:
				return;
		}
	}
}
