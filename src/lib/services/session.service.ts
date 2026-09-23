import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { type AuthSession, NuvioClient } from "#lib/nuvio/index.js";
import {
	isSessionId,
	type SessionStore,
	type StoredSession,
} from "./session-store.service.ts";

export type { StoredSession } from "./session-store.service.ts";

const COOKIE_NAME = "nuvio_session";
const PROFILE_COOKIE_NAME = "nuvio_profile";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MIN_PROFILE_ID = 1;
const MAX_PROFILE_ID = 6;

function mac(payload: string, secret: string): Buffer {
	return createHmac("sha256", secret).update(payload).digest();
}

/** `base64url(value).base64url(hmac)`. */
export function signSessionValue(value: string, secret: string): string {
	const payload = Buffer.from(value).toString("base64url");
	return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

/** The value inside a cookie `signSessionValue` produced, or null if tampered. */
export function verifySessionValue(
	value: string,
	secret: string,
): string | null {
	const dot = value.lastIndexOf(".");
	if (dot < 0) {
		return null;
	}
	const payload = value.slice(0, dot);
	const given = Buffer.from(value.slice(dot + 1), "base64url");
	const expected = mac(payload, secret);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return null;
	}
	return Buffer.from(payload, "base64url").toString();
}

/**
 * Reads and writes the two cookies the app owns : the session and the picked
 * profile, and glues the first to the {@link SessionStore}.
 *
 * The session cookie holds only the HMAC-signed store id; the tokens and the
 * user live server-side, so `hooks.server.ts` can trust the `user` it gets for
 * the admin guard and the instance lock. A cookie written before the store
 * existed (signed JSON, or unsigned) is not an id and reads as signed-out. The
 * profile cookie is not signed: it only picks one of the signed-in account's
 * own profiles, and the upstream token scopes every call to that account.
 *
 * **Request-scoped.** It closes over one request's cookie jar, so it is
 * registered `scoped` and only resolves from a request scope; asking the root
 * container for it throws rather than hand one visitor's cookies to the next.
 */
export class SessionService {
	constructor(
		private readonly cookies: Cookies,
		private readonly secure: boolean,
		private readonly secret: string,
		private readonly store: SessionStore,
	) {}

	/**
	 * This request's session, refreshed through the store when it is due.
	 * Null when signed out; a cookie whose row is gone is dropped. A transient
	 * upstream failure during the refresh throws (see `SessionStore.fresh`).
	 */
	async read(): Promise<StoredSession | null> {
		const id = this.#sessionId();
		if (!id) {
			return null;
		}
		const stored = await this.store.fresh(id);
		if (stored) {
			this.store.touch(id);
		} else {
			this.cookies.delete(COOKIE_NAME, { path: "/" });
		}
		return stored;
	}

	/** Starts a store session for a fresh sign-in, replacing this browser's old one. */
	write(session: AuthSession): StoredSession {
		const previous = this.#sessionId();
		if (previous) {
			this.store.delete(previous);
		}
		const id = this.store.create(session);
		this.cookies.set(
			COOKIE_NAME,
			signSessionValue(id, this.secret),
			this.#cookieOptions(),
		);
		return {
			id,
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
			user: session.user,
		};
	}

	clear(): void {
		const id = this.#sessionId();
		if (id) {
			this.store.delete(id);
		}
		this.cookies.delete(COOKIE_NAME, { path: "/" });
		this.cookies.delete(PROFILE_COOKIE_NAME, { path: "/" });
	}

	readProfileId(): number | null {
		const raw = this.cookies.get(PROFILE_COOKIE_NAME);
		if (!raw) {
			return null;
		}
		const id = Number(raw);
		return Number.isInteger(id) && id >= MIN_PROFILE_ID && id <= MAX_PROFILE_ID
			? id
			: null;
	}

	writeProfileId(profileId: number): void {
		this.cookies.set(
			PROFILE_COOKIE_NAME,
			String(profileId),
			this.#cookieOptions(),
		);
	}

	clearProfileId(): void {
		this.cookies.delete(PROFILE_COOKIE_NAME, { path: "/" });
	}

	/**
	 * A client bound to this request: uses the request `fetch`, carries the
	 * stored token, and routes a session change (sign-out, a new sign-in) back
	 * through this service. Refreshing is the store's job, not the client's.
	 */
	createNuvioClient(
		fetchImpl: typeof fetch,
		stored: StoredSession | null,
	): NuvioClient {
		return new NuvioClient({
			fetch: fetchImpl,
			session: stored ? SessionService.toAuthSession(stored) : null,
			onSessionChange: (session) => {
				if (session) {
					this.write(session);
				} else {
					this.clear();
				}
			},
		});
	}

	static toAuthSession(stored: StoredSession): AuthSession {
		return {
			access_token: stored.access_token,
			token_type: "bearer",
			expires_in: Math.max(
				0,
				stored.expires_at - Math.floor(Date.now() / 1000),
			),
			refresh_token: stored.refresh_token,
			user: stored.user,
		};
	}

	/** The verified store id from the cookie, or null. */
	#sessionId(): string | null {
		const raw = this.cookies.get(COOKIE_NAME);
		if (!raw) {
			return null;
		}
		const id = verifySessionValue(raw, this.secret);
		return id !== null && isSessionId(id) ? id : null;
	}

	#cookieOptions() {
		return {
			path: "/" as const,
			httpOnly: true,
			secure: this.secure,
			sameSite: "lax" as const,
			maxAge: COOKIE_MAX_AGE,
		};
	}
}
