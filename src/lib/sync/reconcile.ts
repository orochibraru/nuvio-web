import type {
	ContentType,
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
} from "./types.ts";
import { libraryKey } from "./types.ts";

export type PendingLibraryWrite =
	| { kind: "library.upsert"; record: LibraryRecord }
	| { kind: "library.delete"; contentType: ContentType; contentId: string };

/**
 * Re-apply still-pending optimistic writes over a freshly reconciled record set,
 * so a background pull that lands before our own push is acknowledged doesn't
 * momentarily revert the user's action.
 */
export function overlayPendingLibrary(
	records: Map<string, LibraryRecord>,
	pending: PendingLibraryWrite[],
): Map<string, LibraryRecord> {
	const next = new Map(records);
	for (const write of pending) {
		if (write.kind === "library.upsert") {
			next.set(
				libraryKey(write.record.contentType, write.record.contentId),
				write.record,
			);
		} else {
			next.delete(libraryKey(write.contentType, write.contentId));
		}
	}
	return next;
}

/** Progress overlay keeps whichever row was watched more recently. */
export function overlayPendingProgress(
	records: Map<string, ProgressRecord>,
	pending: ProgressRecord[],
): Map<string, ProgressRecord> {
	const next = new Map(records);
	for (const record of pending) {
		const existing = next.get(record.progressKey);
		if (!existing || record.lastWatched >= existing.lastWatched) {
			next.set(record.progressKey, record);
		}
	}
	return next;
}

/** Drops entries older than `graceMs`. Used to keep just-flushed writes around
 *  briefly so a delta pull reading a stale server snapshot can't revert them —
 *  the same overlay protection queued writes already get. */
export function pruneStale<T>(
	entries: Array<{ at: number } & T>,
	graceMs: number,
	now = Date.now(),
): Array<{ at: number } & T> {
	const cutoff = now - graceMs;
	return entries.filter((entry) => entry.at > cutoff);
}

/** Prunes stale recently-flushed entries, then merges them with the still-queued
 *  writes (oldest first, so a fresh queued write overrides a recently-flushed
 *  one for the same target). */
export function splitPendingWrites(
	queue: PendingWrite[],
	recentlyFlushed: Array<{ write: PendingWrite; at: number }>,
	graceMs: number,
	now = Date.now(),
): {
	pruned: Array<{ write: PendingWrite; at: number }>;
	pending: PendingWrite[];
} {
	const pruned = pruneStale(recentlyFlushed, graceMs, now);
	return { pruned, pending: [...pruned.map((e) => e.write), ...queue] };
}

export function pendingLibraryWrites(
	writes: PendingWrite[],
): PendingLibraryWrite[] {
	const out: PendingLibraryWrite[] = [];
	for (const write of writes) {
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

export function pendingProgressWrites(
	writes: PendingWrite[],
): ProgressRecord[] {
	return writes
		.filter((write) => write.kind === "progress.push")
		.map((write) => (write as { record: ProgressRecord }).record);
}

/** Shapes a batch of queued writes into the `flushWrites` command's payload. */
export function buildFlushPayload(batch: PendingWrite[]) {
	return {
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
	};
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

/** Whether two pending writes target the same record : a later one supersedes
 *  an earlier one queued for the same target. */
export function sameTarget(a: PendingWrite, b: PendingWrite): boolean {
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

/**
 * `content_id` → furthest incomplete fraction, for resume bars on cards. A
 * title barely started (≤2%) or basically finished (≥90%) doesn't get a bar.
 */
export function libraryProgressMap(
	progress: readonly ProgressRecord[],
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const row of progress) {
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

/** Whether a title is already in the library. */
export function libraryHas(
	library: readonly LibraryRecord[],
	contentType: ContentType,
	contentId: string,
): boolean {
	return library.some(
		(record) =>
			record.contentId === contentId && record.contentType === contentType,
	);
}
