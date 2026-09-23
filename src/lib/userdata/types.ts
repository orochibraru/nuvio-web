import type {
	HistoryRecord,
	LibraryRecord,
	ProgressRecord,
	SyncChanges,
	SyncCursors,
} from "#lib/sync/types.js";

/** The three synced collections, named as `SyncChanges` names them. */
export type Entity = keyof SyncChanges;
export const ENTITIES: readonly Entity[] = ["library", "progress", "history"];

export interface EntityRecords {
	library: LibraryRecord;
	progress: ProgressRecord;
	history: HistoryRecord;
}
export type AnyRecord = EntityRecords[Entity];

/** Which client cursor tracks each entity. */
export const CURSOR_OF: Record<Entity, keyof SyncCursors> = {
	library: "library",
	progress: "watchProgress",
	history: "watchHistory",
};

/**
 * What changed for one (user, profile): the records keyed by identity (`null`
 * for a delete) and the cursors that cover them. `syncDeltas` returns it,
 * `UserDataEvents` emits it. Plain JSON, so it goes on the wire as is.
 */
export interface UserDataChange {
	changes: SyncChanges;
	cursors: SyncCursors;
}

/** A change as `UserDataEvents` emits it; `since` is the cursors it follows. */
export interface UserDataEvent extends UserDataChange {
	since: SyncCursors;
}

export interface UserDataSnapshot {
	cursors: SyncCursors;
	library: LibraryRecord[];
	progress: ProgressRecord[];
	history: HistoryRecord[];
}

/** One row as this server stores it. `at` is the last-write-wins clock. */
export interface StoredRow<E extends Entity = Entity> {
	entity: E;
	key: string;
	record: EntityRecords[E];
	deleted: boolean;
	at: number;
}

/** A page load's read access to the profile's own data, newest first. */
export interface ProfileData {
	library: () => Promise<LibraryRecord[]>;
	progress: () => Promise<ProgressRecord[]>;
	history: () => Promise<HistoryRecord[]>;
}
