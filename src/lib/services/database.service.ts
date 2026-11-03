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

-- One row per sign-in, unlike sign_ins above which is one row per person. A
-- summary cannot answer "when", so the admin page's activity chart needs the
-- events. Pruned to SIGN_IN_EVENT_RETENTION_DAYS on write so an instance that
-- runs for years does not accumulate an unbounded log.
CREATE TABLE IF NOT EXISTS sign_in_events (
	id     INTEGER PRIMARY KEY AUTOINCREMENT,
	email  TEXT NOT NULL,
	at     INTEGER NOT NULL,
	kind   TEXT NOT NULL DEFAULT 'sign_in'
);

CREATE INDEX IF NOT EXISTS sign_in_events_at ON sign_in_events (at);

-- Signed-in sessions. The cookie carries only the signed id; the upstream
-- tokens live here, AES-256-GCM encrypted (see session-store.service.ts), so a
-- background job can refresh them without a request. Times are unix seconds.
-- user_id is the account key; backend_* is a custom backend, null for Nuvio's.
CREATE TABLE IF NOT EXISTS sessions (
	id                 TEXT PRIMARY KEY,
	user_id            TEXT NOT NULL,
	email              TEXT,
	user_json          TEXT NOT NULL,
	access_token_enc   TEXT NOT NULL,
	refresh_token_enc  TEXT NOT NULL,
	expires_at         INTEGER NOT NULL,
	created_at         INTEGER NOT NULL,
	last_seen_at       INTEGER NOT NULL,
	backend_enc        TEXT,
	backend_url        TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_last_seen_at ON sessions (last_seen_at);

-- Backends users signed in through by URL, for the admin to see and ban.
-- Times are unix ms, like the admin tables above.
CREATE TABLE IF NOT EXISTS custom_backends (
	id             TEXT PRIMARY KEY,
	url            TEXT NOT NULL UNIQUE,
	first_seen_at  INTEGER NOT NULL,
	last_seen_at   INTEGER NOT NULL,
	account_count  INTEGER NOT NULL DEFAULT 0,
	banned         INTEGER NOT NULL DEFAULT 0,
	banned_at      INTEGER,
	banned_by      TEXT
);

-- Which account keys signed in through each, so account_count stays distinct.
CREATE TABLE IF NOT EXISTS custom_backend_accounts (
	backend_id   TEXT NOT NULL,
	account_key  TEXT NOT NULL,
	PRIMARY KEY (backend_id, account_key)
);
`;

/**
 * The server-owned state: the signed-in sessions (their upstream tokens), and
 * the facts the admin surface needs about *this* instance : who has signed in
 * here, and whether it is locked to an allowlist. Everything else is proxied to
 * api.nuvio.tv. Opens lazily, so constructing it never touches the disk.
 *
 * @param dataDirectory `NUVIO_DATA_DIR`, the container's `/app/data` : mount a
 * volume there or every session and the sign-in log reset with the container.
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
		const columns = new Set(
			db
				.query<{ name: string }, []>(
					"SELECT name FROM pragma_table_info('sessions')",
				)
				.all()
				.map((column) => column.name),
		);
		for (const column of ["backend_enc", "backend_url"]) {
			if (!columns.has(column)) {
				db.run(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
			}
		}
		db.run(
			"CREATE INDEX IF NOT EXISTS sessions_backend_url ON sessions (backend_url)",
		);
		const eventColumns = db
			.query<{ name: string }, []>(
				"SELECT name FROM pragma_table_info('sign_in_events')",
			)
			.all();
		if (!eventColumns.some((column) => column.name === "kind")) {
			db.run(
				"ALTER TABLE sign_in_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'sign_in'",
			);
		}
		// At most one "active" event per account per day: `at` is the UTC day start.
		db.run(
			"CREATE UNIQUE INDEX IF NOT EXISTS sign_in_events_active_day ON sign_in_events (email, at) WHERE kind = 'active'",
		);
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
				`Database unavailable at ${this.directory}; nobody can sign in, and sign-in metrics and the instance lock are disabled.`,
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
