import type { Database } from "bun:sqlite";
import {
	createHash,
	createHmac,
	hkdfSync,
	randomBytes,
	randomUUID,
} from "node:crypto";
import type { DatabaseService } from "#lib/services/database.service.js";

// Times are unix ms. Refresh and email tokens are stored as their SHA-256 only.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS backend_users (
	id                  TEXT PRIMARY KEY,
	email               TEXT NOT NULL UNIQUE,
	password_hash       TEXT NOT NULL,
	created_at          INTEGER NOT NULL,
	updated_at          INTEGER NOT NULL,
	last_sign_in_at     INTEGER,
	email_confirmed_at  INTEGER
);
CREATE TABLE IF NOT EXISTS backend_sessions (
	id          TEXT PRIMARY KEY,
	user_id     TEXT NOT NULL REFERENCES backend_users (id) ON DELETE CASCADE,
	created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS backend_sessions_user ON backend_sessions (user_id);
CREATE TABLE IF NOT EXISTS backend_refresh_tokens (
	token_hash  TEXT PRIMARY KEY,
	session_id  TEXT NOT NULL REFERENCES backend_sessions (id) ON DELETE CASCADE,
	revoked     INTEGER NOT NULL DEFAULT 0,
	expires_at  INTEGER NOT NULL,
	revoked_at  INTEGER
);
CREATE INDEX IF NOT EXISTS backend_refresh_tokens_session ON backend_refresh_tokens (session_id);
CREATE INDEX IF NOT EXISTS backend_refresh_tokens_expires ON backend_refresh_tokens (expires_at);
CREATE TABLE IF NOT EXISTS backend_email_tokens (
	token_hash  TEXT PRIMARY KEY,
	user_id     TEXT NOT NULL REFERENCES backend_users (id) ON DELETE CASCADE,
	kind        TEXT NOT NULL,
	expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS backend_email_tokens_user ON backend_email_tokens (user_id, kind);
`;

/** Columns added after the first release: users that existed then were never asked to confirm. */
const ADDED_COLUMNS = [
	{
		table: "backend_users",
		column: "email_confirmed_at",
		backfill: "UPDATE backend_users SET email_confirmed_at = created_at",
	},
	{ table: "backend_refresh_tokens", column: "revoked_at", backfill: null },
];

const KEY_SETTING = "builtin_backend.publishable_key";
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;
// GoTrue's default: a client that lost the answer to its refresh may retry it.
const REFRESH_REUSE_INTERVAL_MS = 10 * 1000;
const EMAIL_TOKEN_MS: Record<EmailTokenKind, number> = {
	recovery: 60 * 60 * 1000,
	signup: 24 * 60 * 60 * 1000,
};

export type EmailTokenKind = "recovery" | "signup";

export interface BackendUser {
	id: string;
	email: string;
	password_hash: string;
	created_at: number;
	updated_at: number;
	last_sign_in_at: number | null;
	email_confirmed_at: number | null;
}

export interface IssuedSession {
	userId: string;
	sessionId: string;
	refreshToken: string;
}

export type RefreshOutcome =
	| ({ status: "ok" } & IssuedSession)
	| { status: "missing" | "reused" | "expired" };

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

/** The built-in backend's users and their sessions (one refresh-token family each). */
export class BackendAccounts {
	#migrated: Database | null = null;
	readonly #refreshKey: Buffer;

	constructor(
		private readonly database: Pick<DatabaseService, "connect">,
		secret: string,
		private readonly now: () => number = Date.now,
	) {
		this.#refreshKey = Buffer.from(
			hkdfSync(
				"sha256",
				secret,
				"",
				"nuvio-web built-in backend refresh v1",
				32,
			),
		);
	}

	#db(): Database {
		const db = this.database.connect();
		if (this.#migrated !== db) {
			db.run(SCHEMA);
			for (const { table, column, backfill } of ADDED_COLUMNS) {
				const columns = db
					.query<{ name: string }, [string]>(
						"SELECT name FROM pragma_table_info(?)",
					)
					.all(table);
				if (!columns.some((existing) => existing.name === column)) {
					db.run(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`);
					if (backfill) {
						db.run(backfill);
					}
				}
			}
			this.#migrated = db;
		}
		return db;
	}

	publishableKey(): string {
		const db = this.#db();
		db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
			KEY_SETTING,
			`sb_publishable_${randomBytes(24).toString("base64url")}`,
		);
		return (
			db
				.query<{ value: string }, [string]>(
					"SELECT value FROM settings WHERE key = ?",
				)
				.get(KEY_SETTING)?.value ?? ""
		);
	}

	userByEmail(email: string): BackendUser | null {
		return this.#db()
			.query<BackendUser, [string]>(
				"SELECT * FROM backend_users WHERE email = ?",
			)
			.get(email);
	}

	userById(id: string): BackendUser | null {
		return this.#db()
			.query<BackendUser, [string]>("SELECT * FROM backend_users WHERE id = ?")
			.get(id);
	}

	countUsers(): number {
		return (
			this.#db()
				.query<{ total: number }, []>(
					"SELECT COUNT(*) AS total FROM backend_users",
				)
				.get()?.total ?? 0
		);
	}

	/** Null when the email is taken. */
	createUser(
		email: string,
		passwordHash: string,
		confirmed = true,
	): BackendUser | null {
		const id = randomUUID();
		const now = this.now();
		const inserted = this.#db()
			.query(
				`INSERT INTO backend_users (id, email, password_hash, created_at, updated_at, email_confirmed_at)
				 VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`,
			)
			.run(id, email, passwordHash, now, now, confirmed ? now : null);
		return inserted.changes === 1 ? this.userById(id) : null;
	}

	/** Every session and token goes with the user (ON DELETE CASCADE). */
	deleteUser(userId: string): void {
		this.#db().query("DELETE FROM backend_users WHERE id = ?").run(userId);
	}

	/** Ends every other session and any reset link still out. */
	setPassword(
		userId: string,
		passwordHash: string,
		keepSessionId: string,
	): void {
		const db = this.#db();
		db.transaction(() => {
			db.query(
				"UPDATE backend_users SET password_hash = ?, updated_at = ? WHERE id = ?",
			).run(passwordHash, this.now(), userId);
			db.query("DELETE FROM backend_email_tokens WHERE user_id = ?").run(
				userId,
			);
			this.revokeUserSessions(userId, keepSessionId);
		})();
	}

	/** A fresh single-use link token; the user's earlier one of that kind stops working. */
	issueEmailToken(userId: string, kind: EmailTokenKind): string {
		const token = randomBytes(32).toString("base64url");
		const db = this.#db();
		db.transaction(() => {
			db.query(
				"DELETE FROM backend_email_tokens WHERE expires_at < ? OR (user_id = ? AND kind = ?)",
			).run(this.now(), userId, kind);
			db.query(
				"INSERT INTO backend_email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)",
			).run(sha256(token), userId, kind, this.now() + EMAIL_TOKEN_MS[kind]);
		})();
		return token;
	}

	/** Spends the token, whatever comes next; following it proves the address, so it confirms it. */
	consumeEmailToken(token: string, kind: EmailTokenKind): BackendUser | null {
		const db = this.#db();
		return db.transaction(() => {
			const spent = db
				.query<{ user_id: string; expires_at: number }, [string, string]>(
					"DELETE FROM backend_email_tokens WHERE token_hash = ? AND kind = ? RETURNING user_id, expires_at",
				)
				.get(sha256(token), kind);
			if (!spent || spent.expires_at <= this.now()) {
				return null;
			}
			db.query(
				"UPDATE backend_users SET email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?",
			).run(this.now(), spent.user_id);
			return this.userById(spent.user_id);
		})();
	}

	touchSignIn(userId: string): void {
		this.#db()
			.query("UPDATE backend_users SET last_sign_in_at = ? WHERE id = ?")
			.run(this.now(), userId);
	}

	/** Derived, not random: a retried refresh within the grace interval gets the same answer. */
	#childToken(parent: string): string {
		return createHmac("sha256", this.#refreshKey)
			.update(parent)
			.digest("base64url");
	}

	#issueRefreshToken(
		sessionId: string,
		token = randomBytes(32).toString("base64url"),
	): string {
		this.#db()
			.query(
				"INSERT INTO backend_refresh_tokens (token_hash, session_id, expires_at) VALUES (?, ?, ?)",
			)
			.run(sha256(token), sessionId, this.now() + REFRESH_TOKEN_MS);
		return token;
	}

	#prune(): void {
		const db = this.#db();
		// A spent token is kept until its own expiry, so a replay is still caught.
		db.query(
			`DELETE FROM backend_refresh_tokens WHERE token_hash IN (
				SELECT token_hash FROM backend_refresh_tokens WHERE expires_at < ? LIMIT 500
			)`,
		).run(this.now());
		db.run(
			`DELETE FROM backend_sessions WHERE id IN (
				SELECT s.id FROM backend_sessions s
				WHERE NOT EXISTS (SELECT 1 FROM backend_refresh_tokens t WHERE t.session_id = s.id)
				LIMIT 100
			)`,
		);
	}

	createSession(userId: string): IssuedSession {
		const db = this.#db();
		return db.transaction(() => {
			this.#prune();
			const sessionId = randomUUID();
			db.query(
				"INSERT INTO backend_sessions (id, user_id, created_at) VALUES (?, ?, ?)",
			).run(sessionId, userId, this.now());
			return {
				userId,
				sessionId,
				refreshToken: this.#issueRefreshToken(sessionId),
			};
		})();
	}

	/**
	 * Single use: a spent token presented again revokes its whole session,
	 * unless it was spent within the grace interval and its successor is still
	 * the live one, which is then handed out again.
	 */
	rotateRefreshToken(token: string): RefreshOutcome {
		const db = this.#db();
		const hash = sha256(token);
		return db.transaction((): RefreshOutcome => {
			const row = db
				.query<
					{
						session_id: string;
						revoked: number;
						revoked_at: number | null;
						expires_at: number;
						user_id: string;
					},
					[string]
				>(
					`SELECT t.session_id, t.revoked, t.revoked_at, t.expires_at, s.user_id
					 FROM backend_refresh_tokens t JOIN backend_sessions s ON s.id = t.session_id
					 WHERE t.token_hash = ?`,
				)
				.get(hash);
			if (!row) {
				return { status: "missing" };
			}
			const now = this.now();
			const child = this.#childToken(token);
			if (
				row.revoked === 1 &&
				row.revoked_at !== null &&
				now - row.revoked_at <= REFRESH_REUSE_INTERVAL_MS &&
				db
					.query<{ found: number }, [string, string, number]>(
						"SELECT 1 AS found FROM backend_refresh_tokens WHERE token_hash = ? AND session_id = ? AND revoked = 0 AND expires_at > ?",
					)
					.get(sha256(child), row.session_id, now) !== null
			) {
				return {
					status: "ok",
					userId: row.user_id,
					sessionId: row.session_id,
					refreshToken: child,
				};
			}
			if (row.revoked === 1 || row.expires_at <= now) {
				this.revokeSession(row.session_id);
				return { status: row.revoked === 1 ? "reused" : "expired" };
			}
			db.query(
				"UPDATE backend_refresh_tokens SET revoked = 1, revoked_at = ? WHERE token_hash = ?",
			).run(now, hash);
			return {
				status: "ok",
				userId: row.user_id,
				sessionId: row.session_id,
				refreshToken: this.#issueRefreshToken(row.session_id, child),
			};
		})();
	}

	sessionExists(sessionId: string, userId: string): boolean {
		return (
			this.#db()
				.query<{ found: number }, [string, string]>(
					"SELECT 1 AS found FROM backend_sessions WHERE id = ? AND user_id = ?",
				)
				.get(sessionId, userId) !== null
		);
	}

	revokeSession(sessionId: string): void {
		this.#db()
			.query("DELETE FROM backend_sessions WHERE id = ?")
			.run(sessionId);
	}

	/** Every session of the user, except `keepSessionId` when given. */
	revokeUserSessions(userId: string, keepSessionId: string | null): void {
		this.#db()
			.query("DELETE FROM backend_sessions WHERE user_id = ? AND id IS NOT ?")
			.run(userId, keepSessionId);
	}
}
