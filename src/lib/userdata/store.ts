import type { Database } from "bun:sqlite";
import type { DatabaseService } from "#lib/services/database.service.js";
import type { SyncChanges, SyncCursors } from "#lib/sync/types.js";
import type { UserDataEvents } from "./events.ts";
import { decide, foldChanges, type RemoteChange } from "./merge.ts";
import {
	CURSOR_OF,
	ENTITIES,
	type Entity,
	type EntityRecords,
	type StoredRow,
	type UserDataChange,
	type UserDataEvent,
	type UserDataSnapshot,
} from "./types.ts";

// One table for the three collections: they share the change sequence, the
// tombstones and the outbox, and nothing queries inside a record.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS userdata_records (
	user_id     TEXT NOT NULL,
	profile_id  INTEGER NOT NULL,
	entity      TEXT NOT NULL,
	key         TEXT NOT NULL,
	record      TEXT NOT NULL,
	deleted     INTEGER NOT NULL DEFAULT 0,
	updated_at  INTEGER NOT NULL,
	seq         INTEGER NOT NULL,
	PRIMARY KEY (user_id, profile_id, entity, key)
);
CREATE INDEX IF NOT EXISTS userdata_records_seq
	ON userdata_records (user_id, profile_id, entity, seq);

CREATE TABLE IF NOT EXISTS userdata_profiles (
	user_id          TEXT NOT NULL,
	profile_id       INTEGER NOT NULL,
	seq              INTEGER NOT NULL DEFAULT 0,
	imported_at      INTEGER,
	library_cursor   INTEGER NOT NULL DEFAULT 0,
	progress_cursor  INTEGER NOT NULL DEFAULT 0,
	history_cursor   INTEGER NOT NULL DEFAULT 0,
	pulled_at        INTEGER,
	pushed_at        INTEGER,
	PRIMARY KEY (user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS userdata_outbox (
	user_id          TEXT NOT NULL,
	profile_id       INTEGER NOT NULL,
	entity           TEXT NOT NULL,
	key              TEXT NOT NULL,
	seq              INTEGER NOT NULL,
	attempts         INTEGER NOT NULL DEFAULT 0,
	next_attempt_at  INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, profile_id, entity, key)
);
`;

interface RecordRow {
	entity: Entity;
	key: string;
	record: string;
	deleted: number;
	updated_at: number;
	seq: number;
}

/** Nuvio's own delta cursors for a profile, per entity. */
export type NuvioCursors = Record<Entity, number>;

export interface ProfileState {
	importedAt: number | null;
	nuvioCursors: NuvioCursors;
}

/** A row waiting to be pushed to Nuvio, with its current state. */
export type OutboxEntry = StoredRow & { seq: number; attempts: number };

const DELTA_LIMIT = 1000;

function toStored(row: RecordRow): StoredRow & { seq: number } {
	return {
		entity: row.entity,
		key: row.key,
		record: JSON.parse(row.record),
		deleted: row.deleted === 1,
		at: row.updated_at,
		seq: row.seq,
	};
}

/**
 * The source of truth for library, watch progress and history, per (user,
 * profile). Every write gets the profile's next change sequence number : the
 * cursor clients pull deltas by : and, when it came from this app, an outbox
 * entry `NuvioSync` pushes. Every change is emitted on `UserDataEvents`.
 */
export class UserDataStore {
	#migrated: Database | null = null;

	constructor(
		private readonly database: Pick<DatabaseService, "connect">,
		private readonly events: UserDataEvents,
		private readonly now: () => number = Date.now,
	) {}

	#db(): Database {
		const db = this.database.connect();
		if (this.#migrated !== db) {
			db.run(SCHEMA);
			this.#migrated = db;
		}
		return db;
	}

	profile(userId: string, profileId: number): ProfileState | null {
		const row = this.#db()
			.query<
				{
					imported_at: number | null;
					library_cursor: number;
					progress_cursor: number;
					history_cursor: number;
				},
				[string, number]
			>(
				"SELECT imported_at, library_cursor, progress_cursor, history_cursor FROM userdata_profiles WHERE user_id = ? AND profile_id = ?",
			)
			.get(userId, profileId);
		if (!row) {
			return null;
		}
		return {
			importedAt: row.imported_at,
			nuvioCursors: {
				library: row.library_cursor,
				progress: row.progress_cursor,
				history: row.history_cursor,
			},
		};
	}

	/** Profiles of this user that have been imported, so are worth syncing. */
	importedProfiles(userId: string): number[] {
		return this.#db()
			.query<{ profile_id: number }, [string]>(
				"SELECT profile_id FROM userdata_profiles WHERE user_id = ? AND imported_at IS NOT NULL ORDER BY profile_id",
			)
			.all(userId)
			.map((row) => row.profile_id);
	}

	/** Live rows of one collection, newest first. */
	list<E extends Entity>(
		userId: string,
		profileId: number,
		entity: E,
	): Array<EntityRecords[E]> {
		const records = this.#db()
			.query<{ record: string }, [string, number, string]>(
				"SELECT record FROM userdata_records WHERE user_id = ? AND profile_id = ? AND entity = ? AND deleted = 0",
			)
			.all(userId, profileId, entity)
			.map((row) => JSON.parse(row.record) as EntityRecords[E]);
		return records.sort((a, b) => sortTime(b) - sortTime(a));
	}

	snapshot(userId: string, profileId: number): UserDataSnapshot {
		const seq = this.#currentSeq(userId, profileId);
		return {
			cursors: cursorsAt(seq),
			library: this.list(userId, profileId, "library"),
			progress: this.list(userId, profileId, "progress"),
			history: this.list(userId, profileId, "history"),
		};
	}

	/** Everything past the client's cursors, tombstones as `null`. */
	deltas(
		userId: string,
		profileId: number,
		cursors: SyncCursors,
		limit = DELTA_LIMIT,
	): UserDataChange {
		const db = this.#db();
		const seq = this.#currentSeq(userId, profileId);
		const changes: SyncChanges = {};
		const next: SyncCursors = { ...cursors };
		for (const entity of ENTITIES) {
			const rows = db
				.query<RecordRow, [string, number, string, number, number]>(
					"SELECT * FROM userdata_records WHERE user_id = ? AND profile_id = ? AND entity = ? AND seq > ? ORDER BY seq LIMIT ?",
				)
				.all(userId, profileId, entity, cursors[CURSOR_OF[entity]], limit);
			if (rows.length > 0) {
				changes[entity] = Object.fromEntries(
					rows.map((row) => [
						row.key,
						row.deleted === 1 ? null : JSON.parse(row.record),
					]),
				);
			}
			next[CURSOR_OF[entity]] =
				rows.length === limit ? (rows.at(-1)?.seq ?? seq) : seq;
		}
		return { changes, cursors: next };
	}

	/**
	 * A client's writes. A write older than the row it would replace loses (an
	 * offline client flushing late), but the row is still re-sequenced so that
	 * client's next delta pull corrects it.
	 */
	applyWrites(
		userId: string,
		profileId: number,
		writes: readonly StoredRow[],
	): UserDataEvent {
		const db = this.#db();
		const changes: SyncChanges = {};
		let since = 0;
		db.transaction(() => {
			this.#ensureProfile(userId, profileId);
			since = this.#currentSeq(userId, profileId);
			for (const write of writes) {
				const current = this.#row(userId, profileId, write.entity, write.key);
				const seq = this.#nextSeq(userId, profileId);
				if (current && current.at > write.at) {
					this.#resequence(userId, profileId, write, seq);
					track(changes, current);
					continue;
				}
				const row: StoredRow = {
					...write,
					// A tombstone keeps what we knew about the row it replaced.
					record: write.deleted && current ? current.record : write.record,
				};
				this.#put(userId, profileId, row, seq);
				this.#enqueue(userId, profileId, { ...row, seq });
				track(changes, row);
			}
		})();
		return this.#emit(userId, profileId, changes, since);
	}

	/**
	 * Changes pulled from Nuvio, merged last-write-wins (see `decide`). Also
	 * records Nuvio's cursors for the next pull and, for the first import,
	 * marks the profile imported.
	 */
	applyRemote(
		userId: string,
		profileId: number,
		remote: readonly RemoteChange[],
		options: { cursors?: Partial<NuvioCursors>; imported?: boolean } = {},
	): UserDataEvent {
		const changes: SyncChanges = {};
		let since = 0;
		this.#db().transaction(() => {
			this.#ensureProfile(userId, profileId);
			since = this.#currentSeq(userId, profileId);
			for (const change of foldChanges(remote)) {
				const applied = this.#merge(userId, profileId, change);
				if (applied) {
					track(changes, applied);
				}
			}
			this.#recordPull(userId, profileId, options);
		})();
		return this.#emit(userId, profileId, changes, since);
	}

	/**
	 * After the profile's data was deleted on Nuvio: every live row becomes a
	 * tombstone dated now and the outbox is dropped. Tombstones, not a wipe, so
	 * connected and offline clients catch up through their usual deltas, and a
	 * stale Nuvio upsert pulled later loses to them instead of coming back.
	 */
	clearProfile(userId: string, profileId: number): UserDataEvent {
		const db = this.#db();
		const changes: SyncChanges = {};
		const at = this.now();
		let since = 0;
		db.transaction(() => {
			this.#ensureProfile(userId, profileId);
			since = this.#currentSeq(userId, profileId);
			const live = db
				.query<RecordRow, [string, number]>(
					"SELECT * FROM userdata_records WHERE user_id = ? AND profile_id = ? AND deleted = 0 ORDER BY seq",
				)
				.all(userId, profileId);
			for (const row of live) {
				const tombstone: StoredRow = {
					...toStored(row),
					deleted: true,
					at,
				};
				this.#put(
					userId,
					profileId,
					tombstone,
					this.#nextSeq(userId, profileId),
				);
				track(changes, tombstone);
			}
			db.run(
				"DELETE FROM userdata_outbox WHERE user_id = ? AND profile_id = ?",
				[userId, profileId],
			);
		})();
		return this.#emit(userId, profileId, changes, since);
	}

	/** One remote change against the local row. Returns the row if it changed. */
	#merge(
		userId: string,
		profileId: number,
		change: RemoteChange,
	): StoredRow | null {
		const current = this.#row(userId, profileId, change.entity, change.key);
		const pending = this.#isPending(userId, profileId, change);
		const decision = decide(current, change, pending);
		if (decision === "push" && current) {
			this.#enqueueIfAbsent(userId, profileId, current);
		}
		if (decision !== "apply") {
			return null;
		}
		const row: StoredRow = {
			entity: change.entity,
			key: change.key,
			record: change.deleted && current ? current.record : change.record,
			deleted: change.deleted,
			at: change.at,
		};
		this.#put(userId, profileId, row, this.#nextSeq(userId, profileId));
		this.#dequeue(userId, profileId, row);
		return row;
	}

	#recordPull(
		userId: string,
		profileId: number,
		options: { cursors?: Partial<NuvioCursors>; imported?: boolean },
	): void {
		const db = this.#db();
		const now = this.now();
		for (const entity of ENTITIES) {
			const cursor = options.cursors?.[entity];
			if (cursor !== undefined) {
				db.run(
					`UPDATE userdata_profiles SET ${entity}_cursor = MAX(${entity}_cursor, ?), pulled_at = ? WHERE user_id = ? AND profile_id = ?`,
					[cursor, now, userId, profileId],
				);
			}
		}
		if (options.imported) {
			db.run(
				"UPDATE userdata_profiles SET imported_at = ? WHERE user_id = ? AND profile_id = ?",
				[now, userId, profileId],
			);
		}
	}

	/** Outbox entries due for a push attempt, oldest write first. */
	dueOutbox(userId: string, profileId: number, limit = 500): OutboxEntry[] {
		return this.#db()
			.query<
				RecordRow & { attempts: number },
				[string, number, number, number]
			>(
				`SELECT r.*, o.attempts FROM userdata_outbox o
				JOIN userdata_records r USING (user_id, profile_id, entity, key)
				WHERE o.user_id = ? AND o.profile_id = ? AND o.next_attempt_at <= ?
				ORDER BY o.seq LIMIT ?`,
			)
			.all(userId, profileId, this.now(), limit)
			.map((row) => ({ ...toStored(row), attempts: row.attempts }));
	}

	/**
	 * After a push: drop what went through, back off what didn't. Only entries
	 * whose row hasn't been written since are touched : a newer write keeps
	 * its own outbox entry.
	 */
	settleOutbox(
		userId: string,
		profileId: number,
		entries: readonly OutboxEntry[],
		result: { ok: true } | { ok: false; retryIn: (attempts: number) => number },
	): void {
		const db = this.#db();
		const now = this.now();
		db.transaction(() => {
			for (const entry of entries) {
				const where = [userId, profileId, entry.entity, entry.key, entry.seq];
				if (result.ok) {
					db.run(
						"DELETE FROM userdata_outbox WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ? AND seq = ?",
						where,
					);
				} else {
					const attempts = entry.attempts + 1;
					db.run(
						"UPDATE userdata_outbox SET attempts = ?, next_attempt_at = ? WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ? AND seq = ?",
						[attempts, now + result.retryIn(attempts), ...where],
					);
				}
			}
			if (result.ok && entries.length > 0) {
				db.run(
					"UPDATE userdata_profiles SET pushed_at = ? WHERE user_id = ? AND profile_id = ?",
					[now, userId, profileId],
				);
			}
		})();
	}

	#emit(
		userId: string,
		profileId: number,
		changes: SyncChanges,
		since: number,
	): UserDataEvent {
		const change: UserDataEvent = {
			changes,
			cursors: cursorsAt(this.#currentSeq(userId, profileId)),
			since: cursorsAt(since),
		};
		if (Object.keys(changes).length > 0) {
			this.events.emit(userId, profileId, change);
		}
		return change;
	}

	#ensureProfile(userId: string, profileId: number): void {
		this.#db().run(
			"INSERT OR IGNORE INTO userdata_profiles (user_id, profile_id) VALUES (?, ?)",
			[userId, profileId],
		);
	}

	#currentSeq(userId: string, profileId: number): number {
		return (
			this.#db()
				.query<{ seq: number }, [string, number]>(
					"SELECT seq FROM userdata_profiles WHERE user_id = ? AND profile_id = ?",
				)
				.get(userId, profileId)?.seq ?? 0
		);
	}

	#nextSeq(userId: string, profileId: number): number {
		const row = this.#db()
			.query<{ seq: number }, [string, number]>(
				"UPDATE userdata_profiles SET seq = seq + 1 WHERE user_id = ? AND profile_id = ? RETURNING seq",
			)
			.get(userId, profileId);
		return row?.seq ?? 0;
	}

	#row(
		userId: string,
		profileId: number,
		entity: Entity,
		key: string,
	): (StoredRow & { seq: number }) | undefined {
		const row = this.#db()
			.query<RecordRow, [string, number, string, string]>(
				"SELECT * FROM userdata_records WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ?",
			)
			.get(userId, profileId, entity, key);
		return row ? toStored(row) : undefined;
	}

	#put(userId: string, profileId: number, row: StoredRow, seq: number): void {
		this.#db().run(
			`INSERT INTO userdata_records (user_id, profile_id, entity, key, record, deleted, updated_at, seq)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (user_id, profile_id, entity, key) DO UPDATE SET
				record = excluded.record, deleted = excluded.deleted,
				updated_at = excluded.updated_at, seq = excluded.seq`,
			[
				userId,
				profileId,
				row.entity,
				row.key,
				JSON.stringify(row.record),
				row.deleted ? 1 : 0,
				row.at,
				seq,
			],
		);
	}

	#resequence(
		userId: string,
		profileId: number,
		row: Pick<StoredRow, "entity" | "key">,
		seq: number,
	): void {
		this.#db().run(
			"UPDATE userdata_records SET seq = ? WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ?",
			[seq, userId, profileId, row.entity, row.key],
		);
		this.#db().run(
			"UPDATE userdata_outbox SET seq = ? WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ?",
			[seq, userId, profileId, row.entity, row.key],
		);
	}

	/** A new local write: (re)queue it and restart its backoff. */
	#enqueue(
		userId: string,
		profileId: number,
		row: StoredRow & { seq: number },
	): void {
		this.#db().run(
			`INSERT INTO userdata_outbox (user_id, profile_id, entity, key, seq) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (user_id, profile_id, entity, key) DO UPDATE SET seq = excluded.seq, attempts = 0, next_attempt_at = 0`,
			[userId, profileId, row.entity, row.key, row.seq],
		);
	}

	/** Queue an existing row for a push, leaving an entry already there alone. */
	#enqueueIfAbsent(
		userId: string,
		profileId: number,
		row: StoredRow & { seq: number },
	): void {
		this.#db().run(
			"INSERT OR IGNORE INTO userdata_outbox (user_id, profile_id, entity, key, seq) VALUES (?, ?, ?, ?, ?)",
			[userId, profileId, row.entity, row.key, row.seq],
		);
	}

	#dequeue(
		userId: string,
		profileId: number,
		row: Pick<StoredRow, "entity" | "key">,
	): void {
		this.#db().run(
			"DELETE FROM userdata_outbox WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ?",
			[userId, profileId, row.entity, row.key],
		);
	}

	#isPending(
		userId: string,
		profileId: number,
		row: Pick<StoredRow, "entity" | "key">,
	): boolean {
		return (
			this.#db()
				.query<{ found: number }, [string, number, string, string]>(
					"SELECT 1 AS found FROM userdata_outbox WHERE user_id = ? AND profile_id = ? AND entity = ? AND key = ?",
				)
				.get(userId, profileId, row.entity, row.key) !== null
		);
	}
}

function cursorsAt(seq: number): SyncCursors {
	return { library: seq, watchProgress: seq, watchHistory: seq };
}

function track(changes: SyncChanges, row: StoredRow): void {
	const touched: Record<string, unknown> = changes[row.entity] ?? {};
	touched[row.key] = row.deleted ? null : row.record;
	changes[row.entity] = touched as never;
}

function sortTime(record: EntityRecords[Entity]): number {
	if ("addedAt" in record) {
		return record.addedAt;
	}
	if ("lastWatched" in record) {
		return record.lastWatched;
	}
	return record.watchedAt;
}
