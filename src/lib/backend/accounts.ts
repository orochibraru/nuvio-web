import type { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseService } from "#lib/services/database.service.js";

// Times are unix ms. Refresh tokens are stored as their SHA-256 only.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS backend_users (
	id               TEXT PRIMARY KEY,
	email            TEXT NOT NULL UNIQUE,
	password_hash    TEXT NOT NULL,
	created_at       INTEGER NOT NULL,
	updated_at       INTEGER NOT NULL,
	last_sign_in_at  INTEGER
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
	expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS backend_refresh_tokens_session ON backend_refresh_tokens (session_id);
CREATE INDEX IF NOT EXISTS backend_refresh_tokens_expires ON backend_refresh_tokens (expires_at);
`;

const KEY_SETTING = "builtin_backend.publishable_key";
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

export interface BackendUser {
	id: string;
	email: string;
	password_hash: string;
	created_at: number;
	updated_at: number;
	last_sign_in_at: number | null;
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

	constructor(
		private readonly database: Pick<DatabaseService, "connect">,
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
	createUser(email: string, passwordHash: string): BackendUser | null {
		const id = randomUUID();
		const now = this.now();
		const inserted = this.#db()
			.query(
				`INSERT INTO backend_users (id, email, password_hash, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`,
			)
			.run(id, email, passwordHash, now, now);
		return inserted.changes === 1 ? this.userById(id) : null;
	}

	touchSignIn(userId: string): void {
		this.#db()
			.query("UPDATE backend_users SET last_sign_in_at = ? WHERE id = ?")
			.run(this.now(), userId);
	}

	#issueRefreshToken(sessionId: string): string {
		const token = randomBytes(32).toString("base64url");
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

	/** Single use: a spent token presented again revokes its whole session. */
	rotateRefreshToken(token: string): RefreshOutcome {
		const db = this.#db();
		const hash = sha256(token);
		return db.transaction((): RefreshOutcome => {
			const row = db
				.query<
					{
						session_id: string;
						revoked: number;
						expires_at: number;
						user_id: string;
					},
					[string]
				>(
					`SELECT t.session_id, t.revoked, t.expires_at, s.user_id
					 FROM backend_refresh_tokens t JOIN backend_sessions s ON s.id = t.session_id
					 WHERE t.token_hash = ?`,
				)
				.get(hash);
			if (!row) {
				return { status: "missing" };
			}
			if (row.revoked === 1 || row.expires_at <= this.now()) {
				this.revokeSession(row.session_id);
				return { status: row.revoked === 1 ? "reused" : "expired" };
			}
			db.query(
				"UPDATE backend_refresh_tokens SET revoked = 1 WHERE token_hash = ?",
			).run(hash);
			return {
				status: "ok",
				userId: row.user_id,
				sessionId: row.session_id,
				refreshToken: this.#issueRefreshToken(row.session_id),
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
