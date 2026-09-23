import type {
	LibraryDeltaEvent,
	LibraryItem,
	WatchedItem,
	WatchedItemDeltaEvent,
	WatchProgress,
	WatchProgressDeltaEvent,
} from "#lib/nuvio/index.js";
import {
	type ContentType,
	type HistoryRecord,
	historyKey,
	historyRecordFromDelta,
	historyRecordFromItem,
	type LibraryRecord,
	libraryKey,
	libraryRecordFromDelta,
	libraryRecordFromItem,
	type ProgressRecord,
	progressKeyFor,
	progressRecordFromDelta,
	progressRecordFromRow,
} from "#lib/sync/types.js";
import type { AnyRecord, StoredRow } from "./types.ts";

/**
 * The conflict rules, as pure functions: last write wins on each row's `at`,
 * deletes are tombstones so they sync like any other write.
 */

/** A change pulled from Nuvio. `eventId` orders changes to the same row. */
export type RemoteChange = StoredRow & { eventId: number };

/**
 * - `skip` : nothing to do (an echo of our own push, or a delete of nothing).
 * - `apply` : Nuvio's version replaces ours.
 * - `push` : ours is newer (or an unpushed local write outranks an undated
 *   delete), so it stays and goes (back) to Nuvio.
 */
export type Decision = "skip" | "apply" | "push";

export function sameRecord(a: object, b: object): boolean {
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every(
			(key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
		)
	);
}

/**
 * Nuvio's delete events carry no timestamp, so a remote delete is dated when
 * it is pulled : and it never beats a local write still waiting to be pushed.
 */
export function decide(
	local: StoredRow | undefined,
	remote: StoredRow,
	pending: boolean,
): Decision {
	if (remote.deleted) {
		if (!local || local.deleted) {
			return "skip";
		}
		return pending ? "push" : "apply";
	}
	if (local && !local.deleted && sameRecord(local.record, remote.record)) {
		return "skip";
	}
	if (!local || remote.at >= local.at) {
		return "apply";
	}
	return "push";
}

/** The last change per row, in `eventId` order. */
export function foldChanges(changes: readonly RemoteChange[]): RemoteChange[] {
	const latest = new Map<string, RemoteChange>();
	for (const change of [...changes].sort((a, b) => a.eventId - b.eventId)) {
		latest.set(`${change.entity}\u0000${change.key}`, change);
	}
	return [...latest.values()];
}

export function libraryChanges(
	events: readonly LibraryDeltaEvent[],
	now: number,
): RemoteChange[] {
	return events.map((event) => {
		const record = libraryRecordFromDelta(event);
		const deleted = event.operation === "delete";
		return {
			entity: "library",
			key: libraryKey(record.contentType, record.contentId),
			record,
			deleted,
			at: deleted ? now : record.addedAt,
			eventId: event.event_id,
		};
	});
}

export function progressChanges(
	events: readonly WatchProgressDeltaEvent[],
	now: number,
): RemoteChange[] {
	return events.map((event) => {
		const record = progressRecordFromDelta(event);
		const deleted = event.operation === "delete";
		return {
			entity: "progress",
			key: record.progressKey,
			record,
			deleted,
			at: deleted ? now : record.lastWatched,
			eventId: event.event_id,
		};
	});
}

export function historyChanges(
	events: readonly WatchedItemDeltaEvent[],
	now: number,
): RemoteChange[] {
	return events.map((event) => {
		const record = historyRecordFromDelta(event);
		const deleted = event.operation === "delete";
		return {
			entity: "history",
			key: record.id,
			record,
			deleted,
			at: deleted ? now : record.watchedAt,
			eventId: event.event_id,
		};
	});
}

/** A full pull (the first import) as changes : upserts only. */
export function snapshotChanges(snapshot: {
	library: readonly LibraryItem[];
	progress: readonly WatchProgress[];
	history: readonly WatchedItem[];
}): RemoteChange[] {
	const upsert = (
		entity: StoredRow["entity"],
		key: string,
		record: AnyRecord,
		at: number,
	): RemoteChange => ({
		entity,
		key,
		record,
		deleted: false,
		at,
		eventId: 0,
	});
	return [
		...snapshot.library.map((item) => {
			const record = libraryRecordFromItem(item);
			return upsert(
				"library",
				libraryKey(record.contentType, record.contentId),
				record,
				record.addedAt,
			);
		}),
		...snapshot.progress.map((row) => {
			const record = progressRecordFromRow(row);
			return upsert("progress", record.progressKey, record, record.lastWatched);
		}),
		...snapshot.history.map((item) => {
			const record = historyRecordFromItem(item);
			return upsert("history", record.id, record, record.watchedAt);
		}),
	];
}

/** `flushWrites`'s payload, as its schema parses it. */
export interface FlushBatch {
	libraryUpserts: Array<{
		content_id: string;
		content_type: ContentType;
		name?: string;
		poster?: string;
		background?: string;
		description?: string;
		release_info?: string;
		imdb_rating?: number;
		genres?: string[];
		added_at: number;
	}>;
	libraryDeletes: Array<{ content_id: string; content_type: ContentType }>;
	progressPushes: Array<{
		content_id: string;
		content_type: ContentType;
		video_id: string;
		season?: number;
		episode?: number;
		position: number;
		duration: number;
		last_watched: number;
	}>;
	progressDeletes: string[];
	historyDeletes: Array<{
		content_id: string;
		season?: number;
		episode?: number;
	}>;
}

/**
 * A client write batch as rows. Upserts are dated by their own timestamp
 * (capped at `now`, so a fast client clock can't win every future conflict);
 * deletes are dated `now`. A delete's record only carries the identity : the
 * store keeps the existing row's fields in the tombstone when it has them.
 */
export function localWrites(batch: FlushBatch, now: number): StoredRow[] {
	return [
		...batch.libraryUpserts.map((entry) => libraryUpsert(entry, now)),
		...batch.libraryDeletes.map((entry) => libraryDelete(entry, now)),
		...batch.progressPushes.map((entry) => progressPush(entry, now)),
		...batch.progressDeletes.map((key) => progressDelete(key, now)),
		...batch.historyDeletes.map((entry) => historyDelete(entry, now)),
	];
}

function libraryUpsert(
	entry: FlushBatch["libraryUpserts"][number],
	now: number,
): StoredRow {
	const record: LibraryRecord = {
		contentId: entry.content_id,
		contentType: entry.content_type,
		name: entry.name ?? entry.content_id,
		poster: entry.poster ?? null,
		background: entry.background ?? null,
		description: entry.description ?? null,
		releaseInfo: entry.release_info ?? null,
		imdbRating: entry.imdb_rating ?? null,
		genres: entry.genres ?? [],
		addedAt: entry.added_at,
	};
	return {
		entity: "library",
		key: libraryKey(record.contentType, record.contentId),
		record,
		deleted: false,
		at: Math.min(record.addedAt, now),
	};
}

function libraryDelete(
	entry: FlushBatch["libraryDeletes"][number],
	now: number,
): StoredRow {
	return {
		...libraryUpsert({ ...entry, added_at: now }, now),
		deleted: true,
	};
}

function progressPush(
	entry: FlushBatch["progressPushes"][number],
	now: number,
): StoredRow {
	const season = entry.season ?? null;
	const episode = entry.episode ?? null;
	const record: ProgressRecord = {
		progressKey: progressKeyFor(entry.content_id, season, episode),
		contentId: entry.content_id,
		contentType: entry.content_type,
		videoId: entry.video_id,
		season,
		episode,
		// Nuvio stores integers : rounding here makes its echo match ours.
		position: Math.round(entry.position),
		duration: Math.round(entry.duration),
		lastWatched: entry.last_watched,
	};
	return {
		entity: "progress",
		key: record.progressKey,
		record,
		deleted: false,
		at: Math.min(record.lastWatched, now),
	};
}

function progressDelete(progressKey: string, now: number): StoredRow {
	return {
		entity: "progress",
		key: progressKey,
		record: {
			progressKey,
			contentId: progressKey,
			contentType: "movie",
			videoId: progressKey,
			season: null,
			episode: null,
			position: 0,
			duration: 0,
			lastWatched: now,
		},
		deleted: true,
		at: now,
	};
}

function historyDelete(
	entry: FlushBatch["historyDeletes"][number],
	now: number,
): StoredRow {
	const season = entry.season ?? null;
	const episode = entry.episode ?? null;
	const record: HistoryRecord = {
		id: historyKey(entry.content_id, season, episode),
		contentId: entry.content_id,
		contentType: "movie",
		title: entry.content_id,
		season,
		episode,
		watchedAt: now,
	};
	return { entity: "history", key: record.id, record, deleted: true, at: now };
}

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60_000;

/** Delay before retry number `attempts` of a failed push: 30 s doubling, capped at an hour. */
export function backoffMs(attempts: number): number {
	return Math.min(
		BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1),
		BACKOFF_MAX_MS,
	);
}
