import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { NUVIO_DATA_DIR } from "$app/env/private";
import { log } from "./log.ts";

/**
 * The only server-owned state in the app.
 *
 * Everything else is proxied to api.nuvio.tv and lives in a cookie, but the
 * admin surface needs facts about *this* instance: who has signed in here, and
 * whether the instance is locked to an allowlist. That can't live upstream, so
 * it lives in a SQLite file next to the server.
 *
 * `NUVIO_DATA_DIR` (default `data`, resolved from the working directory) is the
 * container's `/app/data` : mount a volume there or the log resets with the
 * container. Declared in `src/env.ts`, which is what makes it visible to
 * `$app/env/private` at all.
 */

let connection: Database | null = null;
let unavailable = false;

export function dataDir(): string {
	return path.resolve(NUVIO_DATA_DIR);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sign_ins (
	email          TEXT PRIMARY KEY,
	user_id        TEXT NOT NULL,
	first_seen_at  INTEGER NOT NULL,
	last_seen_at   INTEGER NOT NULL,
	sign_in_count  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
	key    TEXT PRIMARY KEY,
	value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allowlist (
	email     TEXT PRIMARY KEY,
	added_at  INTEGER NOT NULL,
	added_by  TEXT NOT NULL
);
`;

/** Applies the schema. Exported so tests can build an in-memory database. */
export function migrate(db: Database): Database {
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");
	db.run(SCHEMA);
	return db;
}

export function getDb(): Database {
	if (!connection) {
		const dir = dataDir();
		mkdirSync(dir, { recursive: true });
		connection = migrate(new Database(path.join(dir, "nuvio.sqlite")));
	}
	return connection;
}

/**
 * The hot paths (every request, and sign-in) use this instead, so an unwritable
 * data directory degrades to "no metrics, no lock" rather than 500-ing the
 * whole app.
 *
 * Failing open is the coherent choice rather than a hole: the lock is *stored*
 * in this database, so no database means nobody ever turned it on. The admin
 * page keeps using `getDb()` : there, the error is the answer.
 */
export function tryDb(): Database | null {
	if (unavailable) {
		return null;
	}
	try {
		return getDb();
	} catch (error) {
		unavailable = true;
		log.error(
			`Admin database unavailable at ${dataDir()}; sign-in metrics and the instance lock are disabled.`,
			{ error: error instanceof Error ? error : "Unknown error" },
		);
		return null;
	}
}

/** Test seam: drops the cached handle so the next `getDb()` reopens. */
export function closeDb(): void {
	connection?.close();
	connection = null;
	unavailable = false;
}
