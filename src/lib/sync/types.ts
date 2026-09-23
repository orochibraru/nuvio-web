import type {
	LibraryDeltaEvent,
	LibraryItem,
	WatchedItem,
	WatchedItemDeltaEvent,
	WatchProgress,
	WatchProgressDeltaEvent,
} from "#lib/nuvio/index.js";

export type ContentType = "movie" | "series";

/** Local mirror of one library entry. Identity: `${contentType}:${contentId}`. */
export interface LibraryRecord {
	contentId: string;
	contentType: ContentType;
	name: string;
	poster: string | null;
	background: string | null;
	description: string | null;
	releaseInfo: string | null;
	imdbRating: number | null;
	genres: string[];
	addedAt: number;
}

/** Local mirror of one watch-progress row. Identity: `progressKey`. */
export interface ProgressRecord {
	progressKey: string;
	contentId: string;
	contentType: ContentType;
	videoId: string;
	season: number | null;
	episode: number | null;
	position: number;
	duration: number;
	lastWatched: number;
}

/** Local mirror of one history row. Identity: `${contentId}:${season ?? ""}:${episode ?? ""}`. */
export interface HistoryRecord {
	id: string;
	contentId: string;
	contentType: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watchedAt: number;
}

export type SyncEntity = "library" | "watchProgress" | "watchHistory";

/** Per-entity `event_id` high-water marks, persisted so pulls resume incrementally. */
export type SyncCursors = Record<SyncEntity, number>;

export const EMPTY_CURSORS: SyncCursors = {
	library: 0,
	watchProgress: 0,
	watchHistory: 0,
};

/** Full in-memory state, broadcast to other same-profile tabs via
 *  BroadcastChannel so a local mutation or sync shows up elsewhere without
 *  waiting for their next poll. */
export interface SyncBroadcastMessage {
	library: LibraryRecord[];
	progress: ProgressRecord[];
	history: HistoryRecord[];
	cursors: SyncCursors;
	queue: PendingWrite[];
	bootstrapped: boolean;
}

/** Records one local mutation touched, per store, keyed by identity; `null`
 *  means the row was deleted. Structured-cloneable, so the same object is
 *  applied locally, persisted, and broadcast to other tabs. */
export interface SyncChanges {
	library?: Record<string, LibraryRecord | null>;
	progress?: Record<string, ProgressRecord | null>;
	history?: Record<string, HistoryRecord | null>;
}

/** A local mutation broadcast to other same-profile tabs: only the touched
 *  records, plus the small shared bits (queue, cursors) whole. */
export interface SyncPatchMessage {
	patch: SyncChanges;
	cursors: SyncCursors;
	queue: PendingWrite[];
	bootstrapped: boolean;
}

/** Anything on the sync `BroadcastChannel`: a full resync or a patch. */
export type SyncChannelMessage = SyncBroadcastMessage | SyncPatchMessage;

/** A queued optimistic mutation awaiting flush to the API. */
export type PendingWrite =
	| { kind: "library.upsert"; record: LibraryRecord; queuedAt: number }
	| {
			kind: "library.delete";
			contentId: string;
			contentType: ContentType;
			queuedAt: number;
	  }
	| { kind: "progress.push"; record: ProgressRecord; queuedAt: number }
	| { kind: "progress.delete"; progressKey: string; queuedAt: number }
	| { kind: "history.delete"; record: HistoryRecord; queuedAt: number };

/** What a queued write targets : two writes with the same target collapse,
 *  the later one wins. The keyed form of `sameTarget` in `reconcile.ts`. */
export function writeTarget(write: PendingWrite): string {
	switch (write.kind) {
		case "library.upsert":
			return `library:${libraryKey(write.record.contentType, write.record.contentId)}`;
		case "library.delete":
			return `library:${libraryKey(write.contentType, write.contentId)}`;
		case "progress.push":
			return `progress:${write.record.progressKey}`;
		case "progress.delete":
			return `progress:${write.progressKey}`;
		default:
			return `history:${write.record.id}`;
	}
}

/** Set or (for `null`) delete each row `touched` names. */
export function applyTouched<T>(
	map: Map<string, T>,
	touched: Record<string, T | null> | undefined,
): void {
	for (const [key, record] of Object.entries(touched ?? {})) {
		if (record === null) {
			map.delete(key);
		} else {
			map.set(key, record);
		}
	}
}

/** A progress save : everything but the key and timestamp the store stamps. */
export type ProgressInput = Omit<ProgressRecord, "progressKey" | "lastWatched">;

export interface MarkWatchedInput {
	contentId: string;
	contentType: ContentType;
	videoId: string;
	season: number | null;
	episode: number | null;
	durationMs: number;
}

export function contentType(value: string): ContentType {
	return value === "series" ? "series" : "movie";
}

export function libraryKey(
	contentType: ContentType,
	contentId: string,
): string {
	return `${contentType}:${contentId}`;
}

export function historyKey(
	contentId: string,
	season: number | null,
	episode: number | null,
): string {
	return `${contentId}:${season ?? ""}:${episode ?? ""}`;
}

/** A bare movie/series progress row is keyed by its `content_id`; an episode
 *  row is namespaced by season/episode so each one tracks separately. */
export function progressKeyFor(
	contentId: string,
	season: number | null,
	episode: number | null,
): string {
	return season != null && episode != null
		? `${contentId}_s${season}e${episode}`
		: contentId;
}

export function libraryRecordFromDelta(
	event: LibraryDeltaEvent,
): LibraryRecord {
	return {
		contentId: event.content_id,
		contentType: contentType(event.content_type),
		name: event.name,
		poster: event.poster,
		background: event.background,
		description: event.description,
		releaseInfo: event.release_info,
		imdbRating: event.imdb_rating,
		genres: event.genres ?? [],
		addedAt: event.added_at,
	};
}

export function progressRecordFromDelta(
	event: WatchProgressDeltaEvent,
): ProgressRecord {
	return {
		progressKey: event.progress_key,
		contentId: event.content_id,
		contentType: contentType(event.content_type),
		videoId: event.video_id,
		season: event.season,
		episode: event.episode,
		position: event.position,
		duration: event.duration,
		lastWatched: event.last_watched,
	};
}

export function historyRecordFromDelta(
	event: WatchedItemDeltaEvent,
): HistoryRecord {
	return {
		id: historyKey(event.content_id, event.season, event.episode),
		contentId: event.content_id,
		contentType: contentType(event.content_type),
		title: event.title,
		season: event.season,
		episode: event.episode,
		watchedAt: event.watched_at,
	};
}

// Snapshot (full-pull) row → local record.

export function libraryRecordFromItem(item: LibraryItem): LibraryRecord {
	return {
		contentId: item.content_id,
		contentType: contentType(item.content_type),
		name: item.name,
		poster: item.poster,
		background: item.background,
		description: item.description,
		releaseInfo: item.release_info,
		imdbRating: item.imdb_rating,
		genres: item.genres ?? [],
		addedAt: item.added_at,
	};
}

export function progressRecordFromRow(row: WatchProgress): ProgressRecord {
	return {
		progressKey: row.progress_key,
		contentId: row.content_id,
		contentType: contentType(row.content_type),
		videoId: row.video_id,
		season: row.season,
		episode: row.episode,
		position: row.position,
		duration: row.duration,
		lastWatched: row.last_watched,
	};
}

export function historyRecordFromItem(item: WatchedItem): HistoryRecord {
	return {
		id: historyKey(item.content_id, item.season, item.episode),
		contentId: item.content_id,
		contentType: contentType(item.content_type),
		title: item.title,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watched_at,
	};
}

/**
 * Namespace for everything this profile keeps in the browser (IndexedDB rows,
 * the `BroadcastChannel` name, recent searches).
 *
 * **The user id is the load-bearing half.** `profileId` is the profile *index*,
 * 1..6 within one Nuvio account, so it is not an identity: on a shared browser
 * or a multi-account instance, two people who both picked profile 1 would read
 * and write each other's rows. Keying on the account too means another account
 * simply never matches, rather than inheriting a stale mirror (and, because
 * `bootstrapped` is persisted alongside it, skipping the full snapshot and
 * flushing the previous account's queued writes into the new one).
 */
export function syncOwner(userId: string, profileId: number): string {
	return `${userId}:${profileId}`;
}
