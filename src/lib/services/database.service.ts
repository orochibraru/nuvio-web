import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DisposableService } from "./container.ts";
import type { Logger } from "./logger.service.ts";

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

/**
 * The only server-owned state in the app. Everything else is proxied to
 * api.nuvio.tv and lives in a cookie, but the admin surface needs facts about
 *this* instance : who has signed in here, and whether it is locked to an
 * allowlist. Opens lazily, so constructing it never touches the disk.
 *
 * @param dataDirectory `NUVIO_DATA_DIR`, the container's `/app/data` : mount a
 * volume there or the sign-in log resets with the container.
 */
export class DatabaseService implements DisposableService {
	#connection: Database | null = null;
	/** When the directory first proved unwritable, or null while it is fine. */
	#unavailableSince: number | null = null;

	constructor(
		private readonly dataDirectory: string,
		private readonly logger: Logger,
	) {}

	/** Applies the schema. Static so a test can build an in-memory database. */
	static migrate(db: Database): Database {
		db.run("PRAGMA journal_mode = WAL");
		db.run("PRAGMA foreign_keys = ON");
		db.run(SCHEMA);
		return db;
	}

	get directory(): string {
		return path.resolve(this.dataDirectory);
	}

	/** Opens on first call. Throws when the directory is unwritable. */
	connect(): Database {
		if (!this.#connection) {
			const dir = this.directory;
			mkdirSync(dir, { recursive: true });
			this.#connection = DatabaseService.migrate(
				new Database(path.join(dir, "nuvio.sqlite")),
			);
		}
		return this.#connection;
	}

	/**
	 * The hot paths (every request, and sign-in) use this instead, so an
	 * unwritable data directory degrades to "no metrics, no lock" rather than
	 * 500-ing the whole app.
	 *
	 * Failing open is the coherent choice rather than a hole: the lock is
	 * stored in this database, so no database means nobody ever turned it on.
	 * The admin page keeps using `connect()` : there, the error is the answer.
	 */
	tryConnect(): Database | null {
		if (this.#unavailableSince !== null) {
			return null;
		}
		try {
			return this.connect();
		} catch (error) {
			this.#unavailableSince = Date.now();
			this.logger.error(
				`Admin database unavailable at ${this.directory}; sign-in metrics and the instance lock are disabled.`,
				{ error: error instanceof Error ? error : "Unknown error" },
			);
			return null;
		}
	}

	/** Drops the cached handle so the next `connect()` reopens. */
	dispose(): void {
		this.#connection?.close();
		this.#connection = null;
		this.#unavailableSince = null;
	}
}
