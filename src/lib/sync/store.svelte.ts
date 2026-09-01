import { browser } from "$app/env";
import { clearProfile, readAll, readOne, replaceAll, writeOne } from "./idb.ts";
import {
	overlayPendingLibrary,
	overlayPendingProgress,
	reconcileHistory,
	reconcileLibrary,
	reconcileProgress,
} from "./reconcile.ts";
import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.js";
import type {
	ContentType,
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
	SyncCursors,
} from "./types.ts";
import {
	EMPTY_CURSORS,
	historyKey,
	historyRecordFromItem,
	libraryKey,
	libraryRecordFromItem,
	progressRecordFromRow,
} from "./types.ts";

const SYNC_INTERVAL_MS = 90_000;
const FLUSH_DEBOUNCE_MS = 1500;
// Let first paint + the page's own SSR calls settle before the background pull.
const INITIAL_SYNC_DELAY_MS = 4000;

function online(): boolean {
	return !browser || navigator.onLine !== false;
}

class SyncStore {
	#profileId: number | null = null;
	#cursors: SyncCursors = { ...EMPTY_CURSORS };
	#bootstrapped = false;
	#queue: PendingWrite[] = [];
	#library = new Map<string, LibraryRecord>();
	#progress = new Map<string, ProgressRecord>();
	#history = new Map<string, HistoryRecord>();

	#syncing = false;
	#flushing = false;
	#flushTimer: ReturnType<typeof setTimeout> | undefined;
	#initialSyncTimer: ReturnType<typeof setTimeout> | undefined;
	#intervalTimer: ReturnType<typeof setInterval> | undefined;
	#onVisible: (() => void) | undefined;

	ready = $state(false);
	// True once a full snapshot has landed — the store is now authoritative.
	// Until then, `synced` is false and pages should keep trusting their SSR data
	// unless the user has made an optimistic change (`mutated`).
	synced = $state(false);
	mutated = $state(false);
	// Two+ consecutive flush failures with writes still queued — the optimistic
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
		const out: Record<string, number> = {};
		for (const row of this.progress) {
			if (row.duration <= 0) {
				continue;
			}
			const fraction = row.position / row.duration;
			if (fraction >= 0.9 || fraction <= 0.02) {
				continue;
			}
			out[row.contentId] = Math.max(
				out[row.contentId] ?? 0,
				Math.min(1, fraction),
			);
		}
		return out;
	}

	/** All progress rows for one title, keyed by `video_id`. */
	titleProgress(
		contentId: string,
	): Record<string, { fraction: number; completed: boolean }> {
		const out: Record<string, { fraction: number; completed: boolean }> = {};
		for (const row of this.progress) {
			if (row.contentId !== contentId || row.duration <= 0) {
				continue;
			}
			const fraction = Math.min(1, row.position / row.duration);
			out[row.videoId] = {
				fraction,
				completed: fraction >= 0.9 && row.duration >= 60_000,
			};
		}
		return out;
	}

	/** Whether a title is in the library (reactive). */
	isInLibrary(contentType: ContentType, contentId: string): boolean {
		return this.library.some(
			(record) =>
				record.contentId === contentId && record.contentType === contentType,
		);
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
		this.#profileId = null;
		this.#cursors = { ...EMPTY_CURSORS };
		this.#bootstrapped = false;
		this.#queue = [];
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
			// biome-ignore lint/suspicious/noUnnecessaryConditions: #bootstrapped flips to true inside #bootstrap() / on hydrate — Biome's flow analysis doesn't cross those boundaries
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
		const progressKey =
			input.season != null && input.episode != null
				? `${input.contentId}_s${input.season}e${input.episode}`
				: input.contentId;
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
		const progressKey =
			input.season != null && input.episode != null
				? `${input.contentId}_s${input.season}e${input.episode}`
				: input.contentId;
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
		void this.#persist("history");
		this.#scheduleFlush();
	}

	async clear(profileId: number): Promise<void> {
		this.#library = new Map();
		this.#progress = new Map();
		this.#history = new Map();
		this.#queue = [];
		this.#cursors = { ...EMPTY_CURSORS };
		this.#bootstrapped = false;
		this.synced = true;
		this.mutated = false;
		this.#publish();
		await clearProfile(profileId);
	}

	#pendingLibrary(): Array<
		| { kind: "library.upsert"; record: LibraryRecord }
		| { kind: "library.delete"; contentType: ContentType; contentId: string }
	> {
		const out: Array<
			| { kind: "library.upsert"; record: LibraryRecord }
			| { kind: "library.delete"; contentType: ContentType; contentId: string }
		> = [];
		for (const write of this.#queue) {
			if (write.kind === "library.upsert") {
				out.push({ kind: write.kind, record: write.record });
			} else if (write.kind === "library.delete") {
				out.push({
					kind: write.kind,
					contentType: write.contentType,
					contentId: write.contentId,
				});
			}
		}
		return out;
	}

	#pendingProgress(): ProgressRecord[] {
		return this.#queue
			.filter((write) => write.kind === "progress.push")
			.map((write) => (write as { record: ProgressRecord }).record);
	}

	#enqueue(write: PendingWrite): void {
		this.#queue = this.#queue.filter(
			(existing) => !sameTarget(existing, write),
		);
		this.#queue.push(write);
		void this.#persist("queue");
	}

	#scheduleFlush(): void {
		clearTimeout(this.#flushTimer);
		this.#flushTimer = setTimeout(() => void this.#flush(), FLUSH_DEBOUNCE_MS);
	}

	/** Force an immediate flush attempt — the "Retry" on the sync-stalled banner. */
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
			await flushWrites({
				libraryUpserts: batch
					.filter((write) => write.kind === "library.upsert")
					.map((write) => {
						const { record } = write as { record: LibraryRecord };
						return {
							content_id: record.contentId,
							content_type: record.contentType,
							name: record.name,
							poster: record.poster ?? undefined,
							background: record.background ?? undefined,
							description: record.description ?? undefined,
							release_info: record.releaseInfo ?? undefined,
							imdb_rating: record.imdbRating ?? undefined,
							genres: record.genres,
							added_at: record.addedAt,
						};
					}),
				libraryDeletes: batch
					.filter((write) => write.kind === "library.delete")
					.map((write) => {
						const w = write as { contentId: string; contentType: ContentType };
						return { content_id: w.contentId, content_type: w.contentType };
					}),
				progressPushes: batch
					.filter((write) => write.kind === "progress.push")
					.map((write) => {
						const { record } = write as { record: ProgressRecord };
						return {
							content_id: record.contentId,
							content_type: record.contentType,
							video_id: record.videoId,
							season: record.season ?? undefined,
							episode: record.episode ?? undefined,
							position: record.position,
							duration: record.duration,
							last_watched: record.lastWatched,
						};
					}),
				progressDeletes: batch
					.filter((write) => write.kind === "progress.delete")
					.map((write) => (write as { progressKey: string }).progressKey),
				historyDeletes: batch
					.filter((write) => write.kind === "history.delete")
					.map((write) => {
						const { record } = write as { record: HistoryRecord };
						return {
							content_id: record.contentId,
							season: record.season ?? undefined,
							episode: record.episode ?? undefined,
						};
					}),
			});
			const flushed = new Set(batch);
			this.#queue = this.#queue.filter((write) => !flushed.has(write));
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
			await writeOne("meta", profileId, "queue", this.#queue);
			return;
		}
		const map =
			which === "library"
				? this.#library
				: which === "progress"
					? this.#progress
					: this.#history;
		await replaceAll(which, profileId, map.entries());
	}

	async #persistAll(): Promise<void> {
		const profileId = this.#profileId;
		if (profileId == null) {
			return;
		}
		await Promise.all([
			replaceAll("library", profileId, this.#library.entries()),
			replaceAll("progress", profileId, this.#progress.entries()),
			replaceAll("history", profileId, this.#history.entries()),
			writeOne("meta", profileId, "cursors", this.#cursors),
			writeOne("meta", profileId, "bootstrapped", this.#bootstrapped),
		]);
	}
}

function libraryTarget(
	write: PendingWrite,
): { contentType: ContentType; contentId: string } | null {
	if (write.kind === "library.upsert") {
		return {
			contentType: write.record.contentType,
			contentId: write.record.contentId,
		};
	}
	if (write.kind === "library.delete") {
		return { contentType: write.contentType, contentId: write.contentId };
	}
	return null;
}

function progressKeyOf(write: PendingWrite): string | null {
	if (write.kind === "progress.push") {
		return write.record.progressKey;
	}
	if (write.kind === "progress.delete") {
		return write.progressKey;
	}
	return null;
}

function sameTarget(a: PendingWrite, b: PendingWrite): boolean {
	const al = libraryTarget(a);
	const bl = libraryTarget(b);
	if (al && bl) {
		return al.contentId === bl.contentId && al.contentType === bl.contentType;
	}
	const ap = progressKeyOf(a);
	const bp = progressKeyOf(b);
	if (ap && bp) {
		return ap === bp;
	}
	if (a.kind === "history.delete" && b.kind === "history.delete") {
		return a.record.id === b.record.id;
	}
	return false;
}

export const sync = new SyncStore();
