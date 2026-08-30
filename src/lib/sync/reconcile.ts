import type {
	LibraryDeltaEvent,
	WatchedItemDeltaEvent,
	WatchProgressDeltaEvent,
} from "$lib/nuvio/index.js";
import type { HistoryRecord, LibraryRecord, ProgressRecord } from "./types.js";
import {
	historyRecordFromDelta,
	libraryKey,
	libraryRecordFromDelta,
	progressRecordFromDelta,
} from "./types.js";

interface DeltaLike {
	event_id: number;
	operation: "upsert" | "delete";
}

export interface ReconcileResult<T> {
	records: Map<string, T>;
	/** Highest `event_id` seen; the next pull resumes after it. `0` when no events. */
	cursor: number;
}

/**
 * Fold an unordered batch of delta events into `current`, in `event_id` order.
 * Later events win (last-write-wins); a `delete` removes the identity.
 */
export function reconcileDeltas<E extends DeltaLike, T>(
	current: Map<string, T>,
	events: E[],
	identityOf: (event: E) => string,
	toRecord: (event: E) => T,
	baseCursor = 0,
): ReconcileResult<T> {
	const records = new Map(current);
	let cursor = baseCursor;
	const ordered = [...events].sort((a, b) => a.event_id - b.event_id);
	for (const event of ordered) {
		const key = identityOf(event);
		if (event.operation === "delete") {
			records.delete(key);
		} else {
			records.set(key, toRecord(event));
		}
		if (event.event_id > cursor) {
			cursor = event.event_id;
		}
	}
	return { records, cursor };
}

export function reconcileLibrary(
	current: Map<string, LibraryRecord>,
	events: LibraryDeltaEvent[],
	baseCursor = 0,
): ReconcileResult<LibraryRecord> {
	return reconcileDeltas(
		current,
		events,
		(event) => libraryKey(normalizeType(event.content_type), event.content_id),
		libraryRecordFromDelta,
		baseCursor,
	);
}

export function reconcileProgress(
	current: Map<string, ProgressRecord>,
	events: WatchProgressDeltaEvent[],
	baseCursor = 0,
): ReconcileResult<ProgressRecord> {
	return reconcileDeltas(
		current,
		events,
		(event) => event.progress_key,
		progressRecordFromDelta,
		baseCursor,
	);
}

export function reconcileHistory(
	current: Map<string, HistoryRecord>,
	events: WatchedItemDeltaEvent[],
	baseCursor = 0,
): ReconcileResult<HistoryRecord> {
	return reconcileDeltas(
		current,
		events,
		(event) => historyRecordFromDelta(event).id,
		historyRecordFromDelta,
		baseCursor,
	);
}

function normalizeType(value: string): "movie" | "series" {
	return value === "series" ? "series" : "movie";
}

/**
 * Re-apply still-pending optimistic writes over a freshly reconciled record set,
 * so a background pull that lands before our own push is acknowledged doesn't
 * momentarily revert the user's action.
 */
export function overlayPendingLibrary(
	records: Map<string, LibraryRecord>,
	pending: Array<
		| { kind: "library.upsert"; record: LibraryRecord }
		| {
				kind: "library.delete";
				contentType: "movie" | "series";
				contentId: string;
		  }
	>,
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
