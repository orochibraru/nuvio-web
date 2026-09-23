import type { StoreName, StorePatch } from "./idb.ts";
import { patchStores, replaceAll, writeOne } from "./idb.ts";
import type {
	HistoryRecord,
	LibraryRecord,
	PendingWrite,
	ProgressRecord,
	SyncChanges,
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

// Suffixed since the cursors became this server's own sequence rather than
// Nuvio's event ids: a mirror saved before that re-bootstraps once.
export const META_CURSORS = "cursors.local";
export const META_BOOTSTRAPPED = "bootstrapped.local";

export function persistRecords(
	owner: string,
	which: RecordStore,
	map: Map<string, LibraryRecord | ProgressRecord | HistoryRecord>,
): Promise<void> {
	return replaceAll(which, owner, snapshotEntries(map));
}

/**
 * Persist one local mutation: only the rows it touched (`put`, or `delete` for
 * a `null`), plus the queue that records it, in a single transaction.
 */
export function persistChanges(
	owner: string,
	changes: SyncChanges,
	queue: PendingWrite[],
): Promise<void> {
	const patches: Partial<Record<StoreName, StorePatch>> = {
		meta: { put: [["queue", $state.snapshot(queue)]] },
	};
	for (const which of ["library", "progress", "history"] as const) {
		const touched = changes[which];
		if (!touched) {
			continue;
		}
		const put: Array<[string, unknown]> = [];
		const remove: string[] = [];
		for (const [identity, record] of Object.entries(touched)) {
			if (record === null) {
				remove.push(identity);
			} else {
				put.push([identity, $state.snapshot(record)]);
			}
		}
		patches[which] = { put, delete: remove };
	}
	return patchStores(owner, patches);
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
		writeOne("meta", owner, META_CURSORS, $state.snapshot(state.cursors)),
		writeOne("meta", owner, META_BOOTSTRAPPED, state.bootstrapped),
	]);
}
