import { browser } from "$app/env";
import { fromBroadcastMessage, toBroadcastMessage } from "./broadcast.ts";
import { clearProfile, readAll, readOne, replaceAll, writeOne } from "./idb.ts";
import type { PendingLibraryWrite } from "./reconcile.ts";
import {
	buildFlushPayload,
	libraryHas,
	libraryProgressMap,
	overlayPendingLibrary,
	overlayPendingProgress,
	pendingLibraryWrites,
	pendingProgressWrites,
	reconcileHistory,
	reconcileLibrary,
	reconcileProgress,
	sameTarget,
	splitPendingWrites,
	titleProgressMap,
} from "./reconcile.ts";
import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.ts";
import type {
	ContentType,
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
	SyncBroadcastMessage,
	SyncCursors,
} from "./types.ts";
import {
	EMPTY_CURSORS,
	historyKey,
	historyRecordFromItem,
	libraryKey,
	libraryRecordFromItem,
	progressKeyFor,
	progressRecordFromRow,
} from "./types.ts";

const SYNC_INTERVAL_MS = 90_000;
const FLUSH_DEBOUNCE_MS = 1500;
// Let first paint + the page's own SSR calls settle before the background pull.
const INITIAL_SYNC_DELAY_MS = 4000;
// A delta pull just after a flush can read a server snapshot that lags the
// write; see #pendingWrites(). Comfortably longer than observed read lag.
const RECENTLY_FLUSHED_GRACE_MS = 15_000;

function online(): boolean {
	return !browser || navigator.onLine !== false;
}

/** Plain (structured-cloneable) entries for IndexedDB : see `#broadcast`. */
function snapshotEntries(
	map: Map<string, unknown>,
): Iterable<[string, unknown]> {
	return [...map.entries()].map(
		([key, value]) => [key, $state.snapshot(value)] as [string, unknown],
	);
}

class SyncStore {
	#profileId: number | null = null;
	#cursors: SyncCursors = { ...EMPTY_CURSORS };
	#bootstrapped = false;
	#queue: PendingWrite[] = [];
	// Just-flushed writes, kept briefly : see RECENTLY_FLUSHED_GRACE_MS.
	#recentlyFlushed: Array<{ write: PendingWrite; at: number }> = [];
	#library = new Map<string, LibraryRecord>();
	#progress = new Map<string, ProgressRecord>();
	#history = new Map<string, HistoryRecord>();

	#syncing = false;
	#flushing = false;
	#flushTimer: ReturnType<typeof setTimeout> | undefined;
	#initialSyncTimer: ReturnType<typeof setTimeout> | undefined;
	#intervalTimer: ReturnType<typeof setInterval> | undefined;
	#onVisible: (() => void) | undefined;
	// Cross-tab coherence: same-profile tabs mirror each other's state instantly
	// instead of waiting for the next poll. Scoped to the profile so switching
	// profiles in one tab can't leak into another tab's different profile.
	#channel: BroadcastChannel | undefined;
	// Set while applying a message from another tab, so re-publishing that state
	// doesn't bounce straight back out as a broadcast of our own.
	#applyingBroadcast = false;

	ready = $state(false);
	// True once a full snapshot has landed : the store is now authoritative.
	// Until then, `synced` is false and pages should keep trusting their SSR data
	// unless the user has made an optimistic change (`mutated`).
	synced = $state(false);
	mutated = $state(false);
	// Two+ consecutive flush failures with writes still queued : the optimistic
	// UI is claiming success for changes that aren't reaching the server.
	stalled = $state(false);
	#flushFailures = 0;
	// Reactive published views. Reads of these track; the private maps do not, so
	// every derived accessor below must go through them, never `#library` etc.
	library = $state<LibraryRecord[]>([]);
	progress = $state<ProgressRecord[]>([]);
	history = $state<HistoryRecord[]>([]);

	/** Pages read the store once it has real data or a pending local change. */
	get authoritative(): boolean {
		return this.ready && (this.synced || this.mutated);
	}

	/** `content_id` → furthest incomplete fraction, for resume bars on cards. */
	get libraryProgress(): Record<string, number> {
		return libraryProgressMap(this.progress);
	}

	/** All progress rows for one title, keyed by `video_id`. */
	titleProgress(
		contentId: string,
	): Record<string, { fraction: number; completed: boolean }> {
		return titleProgressMap(this.progress, contentId);
	}

	/** Whether a title is in the library (reactive). */
	isInLibrary(contentType: ContentType, contentId: string): boolean {
		return libraryHas(this.library, contentType, contentId);
	}

	async attach(profileId: number): Promise<void> {
		if (this.#profileId === profileId) {
			return;
		}
		this.detach();
		this.#profileId = profileId;

		const [library, progress, history, cursors, queue, bootstrapped] =
			await Promise.all([
				readAll<LibraryRecord>("library", profileId),
				readAll<ProgressRecord>("progress", profileId),
				readAll<HistoryRecord>("history", profileId),
				readOne<SyncCursors>("meta", profileId, "cursors"),
				readOne<PendingWrite[]>("meta", profileId, "queue"),
				readOne<boolean>("meta", profileId, "bootstrapped"),
			]);

		this.#cursors = cursors ?? { ...EMPTY_CURSORS };
		this.#queue = queue ?? [];
		this.#bootstrapped = bootstrapped ?? false;

		this.#library = library;
		this.#progress = progress;
		this.#history = history;
		this.#publish();
		this.synced = this.#bootstrapped;
		this.mutated = this.#queue.length > 0;
		this.ready = true;

		if (browser) {
			this.#onVisible = () => {
				if (document.visibilityState === "visible") {
					void this.sync();
				}
			};
			document.addEventListener("visibilitychange", this.#onVisible);
			this.#intervalTimer = setInterval(
				() => void this.sync(),
				SYNC_INTERVAL_MS,
			);
			this.#initialSyncTimer = setTimeout(
				() => void this.sync(),
				INITIAL_SYNC_DELAY_MS,
			);
			if (typeof BroadcastChannel !== "undefined") {
				this.#channel = new BroadcastChannel(`nuvio-sync-${profileId}`);
				this.#channel.onmessage = (event) =>
					this.#applyBroadcast(event.data as SyncBroadcastMessage);
			}
		}
	}

	detach(): void {
		clearInterval(this.#intervalTimer);
		clearTimeout(this.#flushTimer);
		clearTimeout(this.#initialSyncTimer);
		if (this.#onVisible) {
			document.removeEventListener("visibilitychange", this.#onVisible);
			this.#onVisible = undefined;
		}
		// Just close : the state we're about to clear is this tab's local view,
		// not a real change other tabs on the same profile should adopt.
		this.#channel?.close();
		this.#channel = undefined;
		this.#profileId = null;
		this.#cursors = { ...EMPTY_CURSORS };
		this.#bootstrapped = false;
		this.#queue = [];
		this.#recentlyFlushed = [];
		this.#library = new Map();
		this.#progress = new Map();
		this.#history = new Map();
		this.ready = false;
		this.synced = false;
		this.mutated = false;
		this.#publish();
	}

	async sync(): Promise<void> {
		if (this.#profileId == null || this.#syncing || !online()) {
			return;
		}
		this.#syncing = true;
		try {
			// biome-ignore lint/suspicious/noUnnecessaryConditions: #bootstrapped flips to true inside #bootstrap() / on hydrate : Biome's flow analysis doesn't cross those boundaries
			if (!this.#bootstrapped) {
				await this.#bootstrap();
			}
			await this.#pullDeltas();
			await this.#flush();
		} catch {
			// leave state as-is; the next tick retries
		} finally {
			this.#syncing = false;
		}
	}

	async #bootstrap(): Promise<void> {
		const profileId = this.#profileId;
		if (profileId == null) {
			return;
		}
		const snap = await syncSnapshot();
		if (this.#profileId !== profileId) {
			return;
		}

		this.#library = new Map(
			snap.library.map((item) => {
				const record = libraryRecordFromItem(item);
				return [libraryKey(record.contentType, record.contentId), record];
			}),
		);
		this.#progress = new Map(
			snap.watchProgress.map((row) => [
				row.progress_key,
				progressRecordFromRow(row),
			]),
		);
		this.#history = new Map(
			snap.watchHistory.map((item) => {
				const record = historyRecordFromItem(item);
				return [record.id, record];
			}),
		);
		this.#cursors = snap.cursors;
		this.#bootstrapped = true;
		this.synced = true;
		await this.#persistAll();
		this.#publish();
		this.#broadcast();
	}

	async #pullDeltas(): Promise<void> {
		const profileId = this.#profileId;
		if (profileId == null) {
			return;
		}
		const deltas = await syncDeltas(this.#cursors);
		if (this.#profileId !== profileId) {
			return;
		}

		const lib = reconcileLibrary(
			this.#library,
			deltas.library,
			this.#cursors.library,
		);
		const prog = reconcileProgress(
			this.#progress,
			deltas.watchProgress,
			this.#cursors.watchProgress,
		);
		const hist = reconcileHistory(
			this.#history,
			deltas.watchHistory,
			this.#cursors.watchHistory,
		);

		this.#library = overlayPendingLibrary(lib.records, this.#pendingLibrary());
		this.#progress = overlayPendingProgress(
			prog.records,
			this.#pendingProgress(),
		);
		// Honour still-pending "mark unwatched" deletes over a stale delta.
		for (const write of this.#queue) {
			if (write.kind === "progress.delete") {
				this.#progress.delete(write.progressKey);
			}
		}
		this.#history = hist.records;
		this.#cursors = {
			library: lib.cursor,
			watchProgress: prog.cursor,
			watchHistory: hist.cursor,
		};
		await this.#persistAll();
		this.#publish();
		this.#broadcast();
	}

	toggleLibrary(input: {
		contentId: string;
		contentType: ContentType;
		remove: boolean;
		name?: string;
		poster?: string | null;
		background?: string | null;
		description?: string | null;
		releaseInfo?: string | null;
		imdbRating?: number | null;
		genres?: string[];
	}): void {
		const key = libraryKey(input.contentType, input.contentId);
		if (input.remove) {
			this.#library.delete(key);
			this.#enqueue({
				kind: "library.delete",
				contentId: input.contentId,
				contentType: input.contentType,
				queuedAt: Date.now(),
			});
		} else {
			const record: LibraryRecord = {
				contentId: input.contentId,
				contentType: input.contentType,
				name: input.name ?? input.contentId,
				poster: input.poster ?? null,
				background: input.background ?? null,
				description: input.description ?? null,
				releaseInfo: input.releaseInfo ?? null,
				imdbRating: input.imdbRating ?? null,
				genres: input.genres ?? [],
				addedAt: Date.now(),
			};
			this.#library.set(key, record);
			this.#enqueue({ kind: "library.upsert", record, queuedAt: Date.now() });
		}
		this.mutated = true;
		this.#publish();
		this.#broadcast();
		void this.#persist("library");
		this.#scheduleFlush();
	}

	saveProgress(input: {
		contentId: string;
		contentType: ContentType;
		videoId: string;
		season: number | null;
		episode: number | null;
		position: number;
		duration: number;
	}): void {
		if (input.duration <= 0) {
			return;
		}
		const progressKey = progressKeyFor(
			input.contentId,
			input.season,
			input.episode,
		);
		const record: ProgressRecord = {
			progressKey,
			contentId: input.contentId,
			contentType: input.contentType,
			videoId: input.videoId,
			season: input.season,
			episode: input.episode,
			position: input.position,
			duration: input.duration,
			lastWatched: Date.now(),
		};
		this.#progress.set(progressKey, record);
		this.#enqueue({ kind: "progress.push", record, queuedAt: Date.now() });
		this.mutated = true;
		this.#publish();
		this.#broadcast();
		void this.#persist("progress");
		this.#scheduleFlush();
	}

	/** Mark a title/episode as fully watched without playing it. */
	markWatched(input: {
		contentId: string;
		contentType: ContentType;
		videoId: string;
		season: number | null;
		episode: number | null;
		durationMs: number;
	}): void {
		const duration = Math.max(input.durationMs, 60_000);
		this.saveProgress({
			contentId: input.contentId,
			contentType: input.contentType,
			videoId: input.videoId,
			season: input.season,
			episode: input.episode,
			position: duration,
			duration,
		});
	}

	/** Drop a watch-progress row (e.g. "mark unwatched"). */
	clearProgress(input: {
		contentId: string;
		season: number | null;
		episode: number | null;
	}): void {
		const progressKey = progressKeyFor(
			input.contentId,
			input.season,
			input.episode,
		);
		if (!this.#progress.has(progressKey)) {
			return;
		}
		this.#progress.delete(progressKey);
		this.#enqueue({
			kind: "progress.delete",
			progressKey,
			queuedAt: Date.now(),
		});
		this.mutated = true;
		this.#publish();
		this.#broadcast();
		void this.#persist("progress");
		this.#scheduleFlush();
	}

	deleteHistory(input: {
		contentId: string;
		season: number | null;
		episode: number | null;
	}): void {
		const id = historyKey(input.contentId, input.season, input.episode);
		const record = this.#history.get(id);
		this.#history.delete(id);
		this.#enqueue({
			kind: "history.delete",
			record: record ?? {
				id,
				contentId: input.contentId,
				contentType: "movie",
				title: input.contentId,
				season: input.season,
				episode: input.episode,
				watchedAt: Date.now(),
			},
			queuedAt: Date.now(),
		});
		this.mutated = true;
		this.#publish();
		this.#broadcast();
		void this.#persist("history");
		this.#scheduleFlush();
	}

	/** Undo `deleteHistory` (best-effort : no restore endpoint, so a delete
	 *  that already flushed wins back on the next pull). */
	restoreHistory(record: HistoryRecord): void {
		this.#history.set(record.id, record);
		this.#queue = this.#queue.filter(
			(w) => !(w.kind === "history.delete" && w.record.id === record.id),
		);
		this.mutated = true;
		this.#publish();
		this.#broadcast();
		void this.#persist("history");
		void this.#persist("queue");
	}

	async clear(profileId: number): Promise<void> {
		this.#library = new Map();
		this.#progress = new Map();
		this.#history = new Map();
		this.#queue = [];
		this.#recentlyFlushed = [];
		this.#cursors = { ...EMPTY_CURSORS };
		this.#bootstrapped = false;
		this.synced = true;
		this.mutated = false;
		this.#publish();
		this.#broadcast();
		await clearProfile(profileId);
	}

	/** Queued writes plus recently-flushed ones, oldest first so a fresh queued
	 *  write for the same target overrides a recently-flushed one. */
	#pendingWrites(): PendingWrite[] {
		const { pruned, pending } = splitPendingWrites(
			this.#queue,
			this.#recentlyFlushed,
			RECENTLY_FLUSHED_GRACE_MS,
		);
		this.#recentlyFlushed = pruned;
		return pending;
	}

	#pendingLibrary(): PendingLibraryWrite[] {
		return pendingLibraryWrites(this.#pendingWrites());
	}

	#pendingProgress(): ProgressRecord[] {
		return pendingProgressWrites(this.#pendingWrites());
	}

	#enqueue(write: PendingWrite): void {
		this.#queue = this.#queue.filter(
			(existing) => !sameTarget(existing, write),
		);
		this.#queue.push(write);
		void this.#persist("queue");
	}

	/** Tell other same-profile tabs about this tab's current state. */
	#broadcast(): void {
		if (!this.#channel || this.#applyingBroadcast) {
			return;
		}
		// `$state.snapshot` because both this and IndexedDB below go through
		// structured clone, which throws on a `$state` proxy : and records can
		// arrive from a caller holding proxied data (anything a page read out
		// of a streamed `load` promise, say).
		this.#channel.postMessage(
			$state.snapshot(
				toBroadcastMessage({
					library: this.#library,
					progress: this.#progress,
					history: this.#history,
					cursors: this.#cursors,
					queue: this.#queue,
					bootstrapped: this.#bootstrapped,
				}),
			),
		);
	}

	/** Adopt a state message broadcast by another tab on the same profile. */
	#applyBroadcast(message: SyncBroadcastMessage): void {
		if (this.#profileId == null) {
			return;
		}
		this.#applyingBroadcast = true;
		const { library, progress, history } = fromBroadcastMessage(message);
		this.#library = library;
		this.#progress = progress;
		this.#history = history;
		this.#cursors = message.cursors;
		this.#queue = message.queue;
		this.#bootstrapped = message.bootstrapped;
		this.synced = this.#bootstrapped;
		this.mutated = this.#queue.length > 0;
		this.#publish();
		this.#applyingBroadcast = false;
	}

	#scheduleFlush(): void {
		clearTimeout(this.#flushTimer);
		this.#flushTimer = setTimeout(() => void this.#flush(), FLUSH_DEBOUNCE_MS);
	}

	/** Force an immediate flush attempt : the "Retry" on the sync-stalled banner. */
	async flushNow(): Promise<void> {
		clearTimeout(this.#flushTimer);
		await this.#flush();
	}

	async #flush(): Promise<void> {
		if (this.#profileId == null || this.#flushing || !online()) {
			return;
		}
		const batch = this.#queue.slice();
		if (batch.length === 0) {
			return;
		}
		this.#flushing = true;
		try {
			await flushWrites(buildFlushPayload(batch));
			const flushed = new Set(batch);
			this.#queue = this.#queue.filter((write) => !flushed.has(write));
			const flushedAt = Date.now();
			this.#recentlyFlushed.push(
				...batch.map((write) => ({ write, at: flushedAt })),
			);
			void this.#persist("queue");
			this.#flushFailures = 0;
			this.stalled = false;
		} catch {
			// keep the queue; a later sync retries
			this.#flushFailures += 1;
			if (this.#flushFailures >= 2 && this.#queue.length > 0) {
				this.stalled = true;
			}
		} finally {
			this.#flushing = false;
		}
	}

	#publish(): void {
		this.library = [...this.#library.values()].sort(
			(a, b) => b.addedAt - a.addedAt,
		);
		this.progress = [...this.#progress.values()].sort(
			(a, b) => b.lastWatched - a.lastWatched,
		);
		this.history = [...this.#history.values()].sort(
			(a, b) => b.watchedAt - a.watchedAt,
		);
	}

	async #persist(
		which: "library" | "progress" | "history" | "queue",
	): Promise<void> {
		const profileId = this.#profileId;
		if (profileId == null) {
			return;
		}
		if (which === "queue") {
			await writeOne("meta", profileId, "queue", $state.snapshot(this.#queue));
			return;
		}
		const map =
			which === "library"
				? this.#library
				: which === "progress"
					? this.#progress
					: this.#history;
		await replaceAll(which, profileId, snapshotEntries(map));
	}

	async #persistAll(): Promise<void> {
		const profileId = this.#profileId;
		if (profileId == null) {
			return;
		}
		await Promise.all([
			replaceAll("library", profileId, snapshotEntries(this.#library)),
			replaceAll("progress", profileId, snapshotEntries(this.#progress)),
			replaceAll("history", profileId, snapshotEntries(this.#history)),
			writeOne("meta", profileId, "cursors", $state.snapshot(this.#cursors)),
			writeOne("meta", profileId, "bootstrapped", this.#bootstrapped),
		]);
	}
}

export const sync = new SyncStore();
