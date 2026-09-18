import { replaceAll, writeOne } from "./idb.ts";
import type {
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
	SyncCursors,
} from "./types.ts";

/**
 * Writing the store's state to IndexedDB. The store decides *when*; this
 * decides *how*.
 *
 * It lives in a `.svelte.ts` because of `$state.snapshot`: the records come
 * from runes state, and `structuredClone` (which is what IndexedDB does to
 * every value) throws on a `$state` proxy. A plain `.ts` cannot call it.
 */

/** Plain (structured-cloneable) entries for IndexedDB. */
export function snapshotEntries(
	map: Map<string, unknown>,
): Iterable<[string, unknown]> {
	return [...map.entries()].map(
		([key, value]) => [key, $state.snapshot(value)] as [string, unknown],
	);
}

export type RecordStore = "library" | "progress" | "history";

export function persistRecords(
	owner: string,
	which: RecordStore,
	map: Map<string, LibraryRecord | ProgressRecord | HistoryRecord>,
): Promise<void> {
	return replaceAll(which, owner, snapshotEntries(map));
}

export function persistQueue(
	owner: string,
	queue: PendingWrite[],
): Promise<void> {
	return writeOne("meta", owner, "queue", $state.snapshot(queue));
}

export function persistEverything(
	owner: string,
	state: {
		library: Map<string, LibraryRecord>;
		progress: Map<string, ProgressRecord>;
		history: Map<string, HistoryRecord>;
		cursors: SyncCursors;
		bootstrapped: boolean;
	},
): Promise<unknown> {
	return Promise.all([
		persistRecords(owner, "library", state.library),
		persistRecords(owner, "progress", state.progress),
		persistRecords(owner, "history", state.history),
		writeOne("meta", owner, "cursors", $state.snapshot(state.cursors)),
		writeOne("meta", owner, "bootstrapped", state.bootstrapped),
	]);
}
