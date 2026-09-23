import type { UserDataEvent } from "#lib/userdata/types.js";
import { browser } from "$app/env";
import { fromBroadcastMessage, toBroadcastMessage } from "./broadcast.ts";
import { clearOwner, purgeOtherOwners, readAll, readOne } from "./idb.ts";
import { LiveSync, streamedAction } from "./live.ts";
import {
	META_BOOTSTRAPPED,
	META_CURSORS,
	persistChanges,
	persistEverything,
	persistQueue,
} from "./persist.svelte.ts";
import type { PendingLibraryWrite } from "./reconcile.ts";
import {
	buildFlushPayload,
	libraryHas,
	libraryProgressMap,
	overlayPendingLibrary,
	overlayPendingProgress,
	pendingLibraryWrites,
	pendingProgressWrites,
	splitPendingWrites,
} from "./reconcile.ts";
import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.ts";
import type {
	ContentType,
	HistoryRecord,
	LibraryRecord,
	MarkWatchedInput,
	PendingWrite,
	ProgressInput,
	ProgressRecord,
	SyncChanges,
	SyncChannelMessage,
	SyncCursors,
} from "./types.ts";
import {
	applyTouched,
	EMPTY_CURSORS,
	historyKey,
	libraryKey,
	progressKeyFor,
	syncOwner,
	writeTarget,
} from "./types.ts";

const FLUSH_DEBOUNCE_MS = 1500;
// Let first paint + the page's own SSR calls settle before the background pull.
const INITIAL_SYNC_DELAY_MS = 4000;
// A delta pull just after a flush can read a server snapshot that lags the
// write; see #pendingWrites(). Comfortably longer than observed read lag.
const RECENTLY_FLUSHED_GRACE_MS = 15_000;

function online(): boolean {
	return !browser || navigator.onLine !== false;
}

class SyncStore {
	#profileId: number | null = null;
	/** `<userId>:<profileId>`; see `syncOwner` for why the index alone won't do. */
	#owner: string | null = null;
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
	#live: LiveSync | undefined;
	#catchUpPending = false;
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

	/** Whether a title is in the library (reactive). */
	isInLibrary(contentType: ContentType, contentId: string): boolean {
		return libraryHas(this.library, contentType, contentId);
	}

	async attach(profileId: number, userId: string): Promise<void> {
		const owner = syncOwner(userId, profileId);
		if (this.#owner === owner) {
			return;
		}
		this.detach();
		this.#profileId = profileId;
		this.#owner = owner;

		// Anything another account (or another profile) left behind goes now,
		// not whenever it happens to be overwritten. Not awaited with the reads
		// below: it only ever deletes rows this attach will not read.
		void purgeOtherOwners(owner);

		const [library, progress, history, cursors, queue, bootstrapped] =
			await Promise.all([
				readAll<LibraryRecord>("library", owner),
				readAll<ProgressRecord>("progress", owner),
				readAll<HistoryRecord>("history", owner),
				readOne<SyncCursors>("meta", owner, META_CURSORS),
				readOne<PendingWrite[]>("meta", owner, "queue"),
				readOne<boolean>("meta", owner, META_BOOTSTRAPPED),
			]);

		// A late attach (another profile picked while these reads were in
		// flight) must not publish this owner's rows over the new one's.
		if (this.#owner !== owner) {
			return;
		}

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
					this.#live?.connect();
				}
			};
			document.addEventListener("visibilitychange", this.#onVisible);
			this.#live = new LiveSync({
				poll: () => void this.sync(),
				catchUp: () => this.#catchUp(),
				change: (event) => this.#applyStreamed(event),
			});
			this.#initialSyncTimer = setTimeout(
				() => void this.sync(),
				INITIAL_SYNC_DELAY_MS,
			);
			if (typeof BroadcastChannel !== "undefined") {
				this.#channel = new BroadcastChannel(`nuvio-sync-${owner}`);
				this.#channel.onmessage = (event) =>
					this.#applyBroadcast(event.data as SyncChannelMessage);
			}
			this.#live.connect();
		}
	}

	#applyStreamed(event: UserDataEvent): void {
		const action = streamedAction(this.#cursors, event, this.#bootstrapped);
		// No broadcast: every tab has its own stream.
		if (action === "apply") {
			void this.#applyDeltas(event, false);
		} else if (action === "catch-up") {
			this.#catchUp();
		}
	}

	/** A pull now, or right after the one running, which may predate the ask. */
	#catchUp(): void {
		this.#catchUpPending = true;
		void this.sync();
	}

	detach(): void {
		this.#live?.close();
		this.#live = undefined;
		this.#catchUpPending = false;
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
		this.#owner = null;
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
		this.#catchUpPending = false;
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
		// biome-ignore lint/suspicious/noUnnecessaryConditions: set by #catchUp() while the awaits above run
		if (this.#catchUpPending) {
			this.#catchUpPending = false;
			await this.sync();
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
			snap.library.map((record) => [
				libraryKey(record.contentType, record.contentId),
				record,
			]),
		);
		this.#progress = new Map(
			snap.progress.map((record) => [record.progressKey, record]),
		);
		this.#history = new Map(snap.history.map((record) => [record.id, record]));
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
		await this.#applyDeltas(deltas, true);
	}

	/** Server changes onto the mirror, pending local writes kept on top. */
	async #applyDeltas(
		{ changes, cursors }: { changes: SyncChanges; cursors: SyncCursors },
		broadcast: boolean,
	): Promise<void> {
		// Nothing new server-side: every pending write is already applied
		// locally, so reconciling would rewrite and rebroadcast the same state.
		if (!(changes.library || changes.progress || changes.history)) {
			return;
		}

		const library = new Map(this.#library);
		const progress = new Map(this.#progress);
		const history = new Map(this.#history);
		applyTouched(library, changes.library);
		applyTouched(progress, changes.progress);
		applyTouched(history, changes.history);

		this.#library = overlayPendingLibrary(library, this.#pendingLibrary());
		this.#progress = overlayPendingProgress(progress, this.#pendingProgress());
		// Honour still-pending "mark unwatched" deletes over a stale delta.
		for (const write of this.#queue) {
			if (write.kind === "progress.delete") {
				this.#progress.delete(write.progressKey);
			}
		}
		this.#history = history;
		this.#cursors = cursors;
		await this.#persistAll();
		this.#publish();
		if (broadcast) {
			this.#broadcast();
		}
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
			this.#enqueue({
				kind: "library.delete",
				contentId: input.contentId,
				contentType: input.contentType,
				queuedAt: Date.now(),
			});
			this.#commit({ library: { [key]: null } });
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
			this.#enqueue({ kind: "library.upsert", record, queuedAt: Date.now() });
			this.#commit({ library: { [key]: record } });
		}
		this.#scheduleFlush();
	}

	saveProgress(input: ProgressInput): void {
		if (input.duration <= 0) {
			return;
		}
		this.#pushProgress([input]);
	}

	/** Mark a title/episode as fully watched without playing it. */
	markWatched(input: MarkWatchedInput): void {
		this.markManyWatched([input]);
	}

	/** Mark several episodes watched as one change: one queue update, one
	 *  publish, one IndexedDB transaction, one broadcast. */
	markManyWatched(inputs: readonly MarkWatchedInput[]): void {
		this.#pushProgress(
			inputs.map((input) => {
				const duration = Math.max(input.durationMs, 60_000);
				return { ...input, position: duration, duration };
			}),
		);
	}

	#pushProgress(inputs: readonly ProgressInput[]): void {
		if (inputs.length === 0) {
			return;
		}
		const now = Date.now();
		// Keyed, so a duplicate episode in `inputs` collapses to its last entry.
		const touched: Record<string, ProgressRecord> = {};
		for (const input of inputs) {
			const progressKey = progressKeyFor(
				input.contentId,
				input.season,
				input.episode,
			);
			touched[progressKey] = { ...input, progressKey, lastWatched: now };
		}
		this.#enqueue(
			...Object.values(touched).map(
				(record): PendingWrite => ({
					kind: "progress.push",
					record,
					queuedAt: now,
				}),
			),
		);
		this.#commit({ progress: touched });
		this.#scheduleFlush();
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
		this.#enqueue({
			kind: "progress.delete",
			progressKey,
			queuedAt: Date.now(),
		});
		this.#commit({ progress: { [progressKey]: null } });
		this.#scheduleFlush();
	}

	deleteHistory(input: {
		contentId: string;
		season: number | null;
		episode: number | null;
	}): void {
		const id = historyKey(input.contentId, input.season, input.episode);
		const record = this.#history.get(id);
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
		this.#commit({ history: { [id]: null } });
		this.#scheduleFlush();
	}

	/** Undo `deleteHistory` (best-effort : no restore endpoint, so a delete
	 *  that already flushed wins back on the next pull). */
	restoreHistory(record: HistoryRecord): void {
		this.#queue = this.#queue.filter(
			(w) => !(w.kind === "history.delete" && w.record.id === record.id),
		);
		this.#commit({ history: { [record.id]: record } });
	}

	async clear(): Promise<void> {
		const owner = this.#owner;
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
		if (owner) {
			await clearOwner(owner);
		}
	}

	/** Wipes every account's mirror and detaches. See `sync/local-data.ts`. */
	async forget(): Promise<void> {
		this.detach();
		await purgeOtherOwners(null);
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

	/** Queue writes, dropping any queued write they supersede. Not persisted
	 *  here : the `#commit` that follows persists the queue with its rows. */
	#enqueue(...writes: PendingWrite[]): void {
		const targets = new Set(writes.map(writeTarget));
		this.#queue = this.#queue.filter(
			(existing) => !targets.has(writeTarget(existing)),
		);
		this.#queue.push(...writes);
	}

	/** Apply one local mutation: to the maps, the published arrays it touches,
	 *  other tabs and IndexedDB, each exactly once and only for those rows. */
	#commit(changes: SyncChanges): void {
		this.#applyChanges(changes);
		this.mutated = true;
		this.#publish(changes);
		this.#broadcast(changes);
		const owner = this.#owner;
		if (owner != null) {
			void persistChanges(owner, changes, this.#queue);
		}
	}

	#applyChanges(changes: SyncChanges): void {
		applyTouched(this.#library, changes.library);
		applyTouched(this.#progress, changes.progress);
		applyTouched(this.#history, changes.history);
	}

	/** Tell other same-profile tabs what changed : just `changes` when given,
	 *  else this tab's whole state (a resync replaced everything). */
	#broadcast(changes?: SyncChanges): void {
		if (!this.#channel || this.#applyingBroadcast) {
			return;
		}
		const message: SyncChannelMessage = changes
			? {
					patch: changes,
					cursors: this.#cursors,
					queue: this.#queue,
					bootstrapped: this.#bootstrapped,
				}
			: toBroadcastMessage({
					library: this.#library,
					progress: this.#progress,
					history: this.#history,
					cursors: this.#cursors,
					queue: this.#queue,
					bootstrapped: this.#bootstrapped,
				});
		// `$state.snapshot` because both this and IndexedDB go through
		// structured clone, which throws on a `$state` proxy : and records can
		// arrive from a caller holding proxied data (anything a page read out
		// of a streamed `load` promise, say).
		this.#channel.postMessage($state.snapshot(message));
	}

	/** Adopt a message broadcast by another tab on the same profile. */
	#applyBroadcast(message: SyncChannelMessage): void {
		if (this.#profileId == null) {
			return;
		}
		this.#applyingBroadcast = true;
		if ("patch" in message) {
			this.#applyChanges(message.patch);
		} else {
			const { library, progress, history } = fromBroadcastMessage(message);
			this.#library = library;
			this.#progress = progress;
			this.#history = history;
		}
		this.#cursors = message.cursors;
		this.#queue = message.queue;
		this.#bootstrapped = message.bootstrapped;
		this.synced = this.#bootstrapped;
		this.mutated = this.#queue.length > 0;
		this.#publish("patch" in message ? message.patch : undefined);
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
			void this.#persistQueue();
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

	/** Re-publish the sorted arrays : all three, or only those `changes`
	 *  touched. ponytail: a full sort of the touched array, fine at a few
	 *  hundred rows; binary-insert if a profile ever holds thousands. */
	#publish(changes?: SyncChanges): void {
		if (!changes || changes.library) {
			this.library = [...this.#library.values()].sort(
				(a, b) => b.addedAt - a.addedAt,
			);
		}
		if (!changes || changes.progress) {
			this.progress = [...this.#progress.values()].sort(
				(a, b) => b.lastWatched - a.lastWatched,
			);
		}
		if (!changes || changes.history) {
			this.history = [...this.#history.values()].sort(
				(a, b) => b.watchedAt - a.watchedAt,
			);
		}
	}

	async #persistQueue(): Promise<void> {
		const owner = this.#owner;
		if (owner == null) {
			return;
		}
		await persistQueue(owner, this.#queue);
	}

	async #persistAll(): Promise<void> {
		const owner = this.#owner;
		if (owner == null) {
			return;
		}
		await persistEverything(owner, {
			library: this.#library,
			progress: this.#progress,
			history: this.#history,
			cursors: this.#cursors,
			bootstrapped: this.#bootstrapped,
		});
	}
}

export const sync = new SyncStore();
