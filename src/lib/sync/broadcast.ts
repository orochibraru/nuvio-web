import type {
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
	SyncBroadcastMessage,
	SyncCursors,
} from "./types.ts";
import { libraryKey } from "./types.ts";

interface BroadcastState {
	library: Map<string, LibraryRecord>;
	progress: Map<string, ProgressRecord>;
	history: Map<string, HistoryRecord>;
	cursors: SyncCursors;
	queue: PendingWrite[];
	bootstrapped: boolean;
}

/** Serialize the store's private maps into a message for other tabs. */
export function toBroadcastMessage(
	state: BroadcastState,
): SyncBroadcastMessage {
	return {
		library: [...state.library.values()],
		progress: [...state.progress.values()],
		history: [...state.history.values()],
		cursors: state.cursors,
		queue: state.queue,
		bootstrapped: state.bootstrapped,
	};
}

/** Rebuild the store's private maps from a message received from another tab. */
export function fromBroadcastMessage(message: SyncBroadcastMessage): {
	library: Map<string, LibraryRecord>;
	progress: Map<string, ProgressRecord>;
	history: Map<string, HistoryRecord>;
} {
	return {
		library: new Map(
			message.library.map((record) => [
				libraryKey(record.contentType, record.contentId),
				record,
			]),
		),
		progress: new Map(
			message.progress.map((record) => [record.progressKey, record]),
		),
		history: new Map(message.history.map((record) => [record.id, record])),
	};
}
