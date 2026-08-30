import type {
	LibraryDeltaEvent,
	LibraryItem,
	WatchedItem,
	WatchedItemDeltaEvent,
	WatchProgress,
	WatchProgressDeltaEvent,
} from "$lib/nuvio/index.js";

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
	| { kind: "history.delete"; record: HistoryRecord; queuedAt: number };

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
