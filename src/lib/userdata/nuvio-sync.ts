import { pooledMap } from "#lib/core/pool.js";
import type { NuvioClient } from "#lib/nuvio/index.js";
import type {
	DisposableService,
	Logger,
	NuvioTokenSource,
} from "#lib/services/index.js";
import type {
	HistoryRecord,
	LibraryRecord,
	ProgressRecord,
} from "#lib/sync/types.js";
import {
	backoffMs,
	historyChanges,
	libraryChanges,
	progressChanges,
	type RemoteChange,
	snapshotChanges,
} from "./merge.ts";
import type { NuvioCursors, OutboxEntry, UserDataStore } from "./store.ts";
import type { Entity } from "./types.ts";

const ORIGIN = "nuvio-web";
const PAGE_SIZE = 1000;
// A profile this far behind catches up over several syncs rather than one.
const MAX_PAGES = 10;

export interface NuvioSyncOptions {
	/** Background cadence per active user. */
	intervalMs?: number;
	/** How long after its last request a user still counts as active. */
	activeWindowMs?: number;
	/** `touch` syncs right away when the last sync is older than this. */
	touchAfterMs?: number;
	/** Users synced at once by the scheduler. */
	concurrency?: number;
	now?: () => number;
	/** Builds a Nuvio client authenticated as the user. */
	clientFor: (accessToken: string) => NuvioClient;
}

interface PushCall {
	entries: OutboxEntry[];
	send: (client: NuvioClient) => Promise<unknown>;
}

/**
 * Keeps each user's local data and their Nuvio account in step: pulls Nuvio's
 * deltas into the store (so changes from the phone app show up) and pushes the
 * store's outbox to Nuvio, retrying with backoff. Nothing here is on a
 * request's path: when Nuvio is slow or down the app keeps reading and
 * writing the store, and the next sync catches up.
 */
export class NuvioSync implements DisposableService {
	readonly #lastSeen = new Map<string, number>();
	readonly #lastSync = new Map<string, number>();
	readonly #running = new Map<string, Promise<void>>();
	readonly #imports = new Map<string, Promise<boolean>>();
	#timer: ReturnType<typeof setInterval> | undefined;
	readonly #intervalMs: number;
	readonly #activeWindowMs: number;
	readonly #touchAfterMs: number;
	readonly #concurrency: number;
	readonly #now: () => number;
	readonly #clientFor: (accessToken: string) => NuvioClient;

	constructor(
		private readonly store: UserDataStore,
		private readonly tokens: NuvioTokenSource,
		private readonly logger: Logger,
		options: NuvioSyncOptions,
	) {
		this.#clientFor = options.clientFor;
		this.#intervalMs = options.intervalMs ?? 5 * 60_000;
		this.#activeWindowMs = options.activeWindowMs ?? 30 * 60_000;
		this.#touchAfterMs = options.touchAfterMs ?? 30_000;
		this.#concurrency = options.concurrency ?? 4;
		this.#now = options.now ?? Date.now;
	}

	/** A request from this user: keep them on the schedule, sync now if stale. */
	touch(userId: string): void {
		const now = this.#now();
		this.#lastSeen.set(userId, now);
		this.#timer ??= setInterval(() => void this.tick(), this.#intervalMs);
		this.#timer.unref?.();
		if (now - (this.#lastSync.get(userId) ?? 0) > this.#touchAfterMs) {
			void this.syncUser(userId);
		}
	}

	/** One scheduler pass: every user active within the window, bounded. */
	async tick(): Promise<void> {
		const cutoff = this.#now() - this.#activeWindowMs;
		for (const [userId, seen] of this.#lastSeen) {
			if (seen < cutoff) {
				this.#lastSeen.delete(userId);
				this.#lastSync.delete(userId);
			}
		}
		await pooledMap([...this.#lastSeen.keys()], this.#concurrency, (userId) =>
			this.syncUser(userId),
		);
	}

	/** Pull then push every imported profile of this user. Single-flight per user; never throws. */
	syncUser(userId: string): Promise<void> {
		const running = this.#running.get(userId);
		if (running !== undefined) {
			return running;
		}
		this.#lastSync.set(userId, this.#now());
		const run = this.#sync(userId).finally(() => this.#running.delete(userId));
		this.#running.set(userId, run);
		return run;
	}

	/**
	 * The first time a profile is seen, copy its data from Nuvio before
	 * serving it, so a fresh instance doesn't start empty. Resolves `false`
	 * (and the next call retries) when Nuvio can't be reached; never throws.
	 */
	ensureImported(
		userId: string,
		profileId: number,
		client: NuvioClient,
	): Promise<boolean> {
		if (this.store.profile(userId, profileId)?.importedAt != null) {
			return Promise.resolve(true);
		}
		const key = `${userId}:${profileId}`;
		const running = this.#imports.get(key);
		if (running !== undefined) {
			return running;
		}
		const run = this.#import(userId, profileId, client).finally(() =>
			this.#imports.delete(key),
		);
		this.#imports.set(key, run);
		return run;
	}

	dispose(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	async #import(
		userId: string,
		profileId: number,
		client: NuvioClient,
	): Promise<boolean> {
		try {
			// Cursors before the pulls, so the first delta pull covers anything
			// that changes while the pulls page.
			const cursors: NuvioCursors = {
				library: await client.library.deltaCursor(profileId),
				progress: await client.watchProgress.deltaCursor(profileId),
				history: await client.watchHistory.deltaCursor(profileId),
			};
			const library = await client.library.pull({
				p_profile_id: profileId,
				p_limit: PAGE_SIZE,
			});
			const progress = await client.watchProgress.pull({
				p_profile_id: profileId,
				p_limit: PAGE_SIZE,
			});
			const history = await client.watchHistory.pull({
				p_profile_id: profileId,
				p_page: 1,
				p_page_size: PAGE_SIZE,
			});
			this.store.applyRemote(
				userId,
				profileId,
				snapshotChanges({ library, progress, history }),
				{ cursors, imported: true },
			);
			this.logger.info("Imported profile from Nuvio", { userId, profileId });
			return true;
		} catch (error) {
			this.logger.warn("Nuvio import failed; serving local data", {
				userId,
				profileId,
				error: describe(error),
			});
			return false;
		}
	}

	async #sync(userId: string): Promise<void> {
		const token = await this.tokens.accessTokenFor(userId).catch(() => null);
		if (!token) {
			this.logger.debug("No Nuvio token; sync skipped", { userId });
			return;
		}
		const client = this.#clientFor(token);
		for (const profileId of this.#profiles(userId)) {
			try {
				// biome-ignore lint/performance/noAwaitInLoops: one profile at a time keeps a user's sync to one request in flight
				await this.#pull(client, userId, profileId);
				await this.#push(client, userId, profileId);
			} catch (error) {
				this.logger.warn("Nuvio sync failed; will retry", {
					userId,
					profileId,
					error: describe(error),
				});
			}
		}
	}

	#profiles(userId: string): number[] {
		try {
			return this.store.importedProfiles(userId);
		} catch (error) {
			this.logger.error("User data store unavailable", {
				error: describe(error),
			});
			return [];
		}
	}

	async #pull(
		client: NuvioClient,
		userId: string,
		profileId: number,
	): Promise<void> {
		const state = this.store.profile(userId, profileId);
		if (!state) {
			return;
		}
		const { nuvioCursors: cursors } = state;
		const params = (since: number) => ({
			p_profile_id: profileId,
			p_since_event_id: since,
			p_limit: PAGE_SIZE,
		});
		await this.#pullFeed(userId, profileId, {
			entity: "library",
			since: cursors.library,
			pull: (since) => client.library.pullDelta(params(since)),
			toChanges: libraryChanges,
		});
		await this.#pullFeed(userId, profileId, {
			entity: "progress",
			since: cursors.progress,
			pull: (since) => client.watchProgress.pullDelta(params(since)),
			toChanges: progressChanges,
		});
		await this.#pullFeed(userId, profileId, {
			entity: "history",
			since: cursors.history,
			pull: (since) => client.watchHistory.pullDelta(params(since)),
			toChanges: historyChanges,
		});
	}

	/** Page one Nuvio delta feed into the store, saving the cursor per page. */
	async #pullFeed<E extends { event_id: number }>(
		userId: string,
		profileId: number,
		feed: {
			entity: Entity;
			since: number;
			pull: (since: number) => Promise<E[]>;
			toChanges: (events: readonly E[], now: number) => RemoteChange[];
		},
	): Promise<void> {
		const { entity, pull, toChanges } = feed;
		let cursor = feed.since;
		for (let page = 0; page < MAX_PAGES; page++) {
			// biome-ignore lint/performance/noAwaitInLoops: each page starts at the previous page's cursor
			const events = await pull(cursor);
			if (events.length === 0) {
				return;
			}
			cursor = Math.max(cursor, ...events.map((event) => event.event_id));
			this.store.applyRemote(
				userId,
				profileId,
				toChanges(events, this.#now()),
				{
					cursors: { [entity]: cursor },
				},
			);
			if (events.length < PAGE_SIZE) {
				return;
			}
		}
	}

	async #push(
		client: NuvioClient,
		userId: string,
		profileId: number,
	): Promise<void> {
		const due = this.store.dueOutbox(userId, profileId);
		for (const call of pushCalls(due, profileId)) {
			try {
				// biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, one write in flight per user
				await call.send(client);
				this.store.settleOutbox(userId, profileId, call.entries, { ok: true });
			} catch (error) {
				this.store.settleOutbox(userId, profileId, call.entries, {
					ok: false,
					retryIn: backoffMs,
				});
				this.logger.warn("Nuvio push failed; backing off", {
					userId,
					profileId,
					count: call.entries.length,
					error: describe(error),
				});
			}
		}
	}
}

/** The outbox as Nuvio calls: one per entity and operation. */
export function pushCalls(
	entries: readonly OutboxEntry[],
	profileId: number,
): PushCall[] {
	const calls: PushCall[] = [];
	const add = <R>(
		entity: Entity,
		deleted: boolean,
		send: (client: NuvioClient, records: R[]) => Promise<unknown>,
	) => {
		const group = entries.filter(
			(entry) => entry.entity === entity && entry.deleted === deleted,
		);
		if (group.length > 0) {
			const records = group.map((entry) => entry.record as R);
			calls.push({ entries: group, send: (client) => send(client, records) });
		}
	};
	const origin = { p_profile_id: profileId, p_origin_client_id: ORIGIN };

	add<LibraryRecord>("library", false, (client, items) =>
		client.library.upsertItems({ ...origin, p_items: items.map(libraryInput) }),
	);
	add<LibraryRecord>("library", true, (client, items) =>
		client.library.deleteItems({
			...origin,
			p_keys: items.map((item) => ({
				content_id: item.contentId,
				content_type: item.contentType,
			})),
		}),
	);
	add<ProgressRecord>("progress", false, (client, rows) =>
		client.watchProgress.push({
			p_profile_id: profileId,
			p_entries: rows.map(progressInput),
		}),
	);
	add<ProgressRecord>("progress", true, (client, rows) =>
		client.watchProgress.deleteMany(
			rows.map((row) => row.progressKey),
			profileId,
		),
	);
	add<HistoryRecord>("history", false, (client, items) =>
		client.watchHistory.push({
			p_profile_id: profileId,
			p_items: items.map((item) => ({
				...historyKeyInput(item),
				content_type: item.contentType,
				title: item.title,
				watched_at: item.watchedAt,
			})),
		}),
	);
	add<HistoryRecord>("history", true, (client, items) =>
		client.watchHistory.delete(items.map(historyKeyInput), profileId),
	);
	return calls;
}

function libraryInput(item: LibraryRecord) {
	return {
		content_id: item.contentId,
		content_type: item.contentType,
		name: item.name,
		poster: item.poster ?? undefined,
		background: item.background ?? undefined,
		description: item.description ?? undefined,
		release_info: item.releaseInfo ?? undefined,
		imdb_rating: item.imdbRating ?? undefined,
		genres: item.genres,
		added_at: item.addedAt,
	};
}

function progressInput(row: ProgressRecord) {
	return {
		content_id: row.contentId,
		content_type: row.contentType,
		video_id: row.videoId,
		season: row.season ?? undefined,
		episode: row.episode ?? undefined,
		position: Math.round(row.position),
		duration: Math.round(row.duration),
		last_watched: row.lastWatched,
	};
}

function historyKeyInput(item: HistoryRecord) {
	return {
		content_id: item.contentId,
		season: item.season ?? undefined,
		episode: item.episode ?? undefined,
	};
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
