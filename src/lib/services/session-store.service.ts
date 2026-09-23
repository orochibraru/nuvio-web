import type { Database } from "bun:sqlite";
import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { type AuthSession, NuvioApiError } from "#lib/nuvio/index.js";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";
import type { NuvioTokenSource } from "./tokens.ts";

/** A live session as the rest of the server sees it: decrypted, one row. */
export interface StoredSession {
	id: string;
	access_token: string;
	refresh_token: string;
	/** Unix seconds. */
	expires_at: number;
	user: AuthSession["user"];
}

/** Trades a refresh token for a new session (the rotated one included). */
export type SessionRefresher = (refreshToken: string) => Promise<AuthSession>;

interface SessionRow {
	id: string;
	user_json: string;
	access_token_enc: string;
	refresh_token_enc: string;
	expires_at: number;
}

/**
 * Declared here rather than in `tokens.ts`: only server code may reach this
 * store, and this module is server-only (`node:crypto`). The background sync
 * wants `NUVIO_TOKENS`, which is this same instance.
 */
export const SESSION_STORE = serviceToken<SessionStore>("SessionStore");

const DAY = 60 * 60 * 24;
/** A session nobody has used for this long is gone, like the cookie. */
export const SESSION_IDLE_SECONDS = 30 * DAY;
/** Refresh this long before the upstream expiry, not on it. */
const REFRESH_SKEW_SECONDS = 60;
/** `last_seen_at` is written at most this often per session. */
const TOUCH_INTERVAL_SECONDS = 60;
/** Rows pruned per sign-in, so one sign-in never pays for a year of backlog. */
const PRUNE_BATCH = 100;
/** Supabase answers a spent / revoked refresh token with one of these. */
const AUTH_FAILURE_STATUSES = new Set([400, 401, 403]);
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function nowInSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/** True for a string shaped like an id {@link SessionStore.create} hands out. */
export function isSessionId(value: string): boolean {
	return ID_PATTERN.test(value);
}

/**
 * Where a signed-in user's upstream tokens live: one SQLite row per session,
 * tokens AES-256-GCM encrypted with a key HKDF-derived from the session secret
 * (a different key from the cookie MAC's), each ciphertext bound to its row id
 * so rows cannot swap tokens.
 *
 * **The one refresh path.** Nuvio auth is Supabase-style: refresh tokens
 * rotate, and replaying a spent one can revoke the whole session. So requests
 * ({@link fresh}) and the background sync ({@link accessTokenFor}) both go
 * through {@link fresh}, which refreshes at most once at a time per session
 * (an in-process single-flight) and persists the rotated token before anyone
 * else reads the row. That guarantee is per process: run one instance per
 * data directory.
 *
 * Singleton: it owns the single-flight map, which is worthless per request.
 */
export class SessionStore implements NuvioTokenSource {
	readonly #key: Buffer;
	readonly #inFlight = new Map<string, Promise<StoredSession | null>>();

	constructor(
		private readonly database: Pick<DatabaseService, "tryConnect">,
		secret: string,
		private readonly refresher: SessionRefresher,
		private readonly logger: Logger,
	) {
		this.#key = Buffer.from(
			hkdfSync("sha256", secret, "", "nuvio-web session tokens v1", 32),
		);
	}

	static isExpired(expiresAt: number, skewSeconds = REFRESH_SKEW_SECONDS) {
		return expiresAt - skewSeconds <= nowInSeconds();
	}

	/** Stores a fresh sign-in and returns its id. Throws with no database. */
	create(session: AuthSession): string {
		const db = this.#db();
		if (!db) {
			throw new Error(
				"Session store unavailable: the data directory is not writable.",
			);
		}
		const id = randomBytes(32).toString("base64url");
		const now = nowInSeconds();
		db.run(
			`DELETE FROM sessions WHERE id IN (
				SELECT id FROM sessions WHERE last_seen_at < ? LIMIT ${PRUNE_BATCH}
			)`,
			[now - SESSION_IDLE_SECONDS],
		);
		db.run(
			`INSERT INTO sessions (id, user_id, email, user_json, access_token_enc,
				refresh_token_enc, expires_at, created_at, last_seen_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				session.user.id,
				session.user.email ?? null,
				JSON.stringify(session.user),
				this.encrypt(id, session.access_token),
				this.encrypt(id, session.refresh_token),
				now + session.expires_in,
				now,
				now,
			],
		);
		return id;
	}

	/** The session as stored (possibly expired), or null if unknown / idle / undecryptable. */
	get(id: string): StoredSession | null {
		const row = this.#db()
			?.query<SessionRow, [string, number]>(
				`SELECT id, user_json, access_token_enc, refresh_token_enc, expires_at
				FROM sessions WHERE id = ? AND last_seen_at >= ?`,
			)
			.get(id, nowInSeconds() - SESSION_IDLE_SECONDS);
		if (!row) {
			return null;
		}
		try {
			return {
				id: row.id,
				access_token: this.decrypt(id, row.access_token_enc),
				refresh_token: this.decrypt(id, row.refresh_token_enc),
				expires_at: row.expires_at,
				user: JSON.parse(row.user_json),
			};
		} catch {
			// Wrong key (the secret changed) or a tampered row: unusable either way.
			this.delete(id);
			return null;
		}
	}

	delete(id: string): void {
		this.#db()?.run("DELETE FROM sessions WHERE id = ?", [id]);
	}

	deleteAllForUser(userId: string): void {
		this.#db()?.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
	}

	/** Marks the session used, at most once a minute. */
	touch(id: string): void {
		const now = nowInSeconds();
		this.#db()?.run(
			"UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?",
			[now, id, now - TOUCH_INTERVAL_SECONDS],
		);
	}

	/**
	 * The session with a usable access token: refreshed first when it is
	 * expired or about to be. Null when there is no such session, or upstream
	 * refused the refresh (the row is deleted then: its refresh token is dead).
	 * A transient upstream failure (5xx, 429, network) throws and keeps the row.
	 */
	fresh(id: string): Promise<StoredSession | null> {
		const pending = this.#inFlight.get(id);
		if (pending !== undefined) {
			return pending;
		}
		const stored = this.get(id);
		if (!(stored && SessionStore.isExpired(stored.expires_at))) {
			return Promise.resolve(stored);
		}
		const refresh = this.#refresh(stored).finally(() => {
			this.#inFlight.delete(id);
		});
		this.#inFlight.set(id, refresh);
		return refresh;
	}

	/** {@link NuvioTokenSource}: the user's most recently seen live session. */
	async accessTokenFor(userId: string): Promise<string | null> {
		const ids =
			this.#db()
				?.query<{ id: string }, [string, number]>(
					`SELECT id FROM sessions WHERE user_id = ? AND last_seen_at >= ?
					ORDER BY last_seen_at DESC, created_at DESC`,
				)
				.all(userId, nowInSeconds() - SESSION_IDLE_SECONDS) ?? [];
		for (const { id } of ids) {
			// biome-ignore lint/performance/noAwaitInLoops: sequential on purpose; the next session only matters when this one turned out dead, and each may cost an upstream refresh.
			const session = await this.fresh(id);
			if (session) {
				return session.access_token;
			}
		}
		return null;
	}

	async #refresh(stored: StoredSession): Promise<StoredSession | null> {
		let next: AuthSession;
		try {
			next = await this.refresher(stored.refresh_token);
		} catch (error) {
			if (
				error instanceof NuvioApiError &&
				AUTH_FAILURE_STATUSES.has(error.status)
			) {
				this.logger.info("Session refresh refused; signing it out", {
					status: error.status,
				});
				this.delete(stored.id);
				return null;
			}
			throw error;
		}
		const expiresAt = nowInSeconds() + next.expires_in;
		this.#db()?.run(
			`UPDATE sessions SET access_token_enc = ?, refresh_token_enc = ?,
				expires_at = ?, user_json = ?, email = ? WHERE id = ?`,
			[
				this.encrypt(stored.id, next.access_token),
				this.encrypt(stored.id, next.refresh_token),
				expiresAt,
				JSON.stringify(next.user),
				next.user.email ?? null,
				stored.id,
			],
		);
		return {
			id: stored.id,
			access_token: next.access_token,
			refresh_token: next.refresh_token,
			expires_at: expiresAt,
			user: next.user,
		};
	}

	/** `base64url(iv | tag | ciphertext)`, authenticated against `id`. */
	encrypt(id: string, plaintext: string): string {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
		cipher.setAAD(Buffer.from(id));
		const body = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
	}

	/** Throws on a wrong key, a wrong id, or any tampering. */
	decrypt(id: string, value: string): string {
		const raw = Buffer.from(value, "base64url");
		const decipher = createDecipheriv(
			"aes-256-gcm",
			this.#key,
			raw.subarray(0, IV_BYTES),
		);
		decipher.setAAD(Buffer.from(id));
		decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
		return Buffer.concat([
			decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
			decipher.final(),
		]).toString("utf8");
	}

	#db(): Database | null {
		return this.database.tryConnect();
	}
}
