import type { Cookies } from "@sveltejs/kit";
import {
	type AuthSession,
	NuvioClient,
	type NuvioUser,
} from "#lib/nuvio/index.js";

const COOKIE_NAME = "nuvio_session";
const PROFILE_COOKIE_NAME = "nuvio_profile";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MIN_PROFILE_ID = 1;
const MAX_PROFILE_ID = 6;

export interface StoredSession {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	user: NuvioUser;
}

function nowInSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/**
 * Reads and writes the two cookies the app owns : the upstream session and the
 * picked profile.
 *
 * **Request-scoped.** It closes over one request's cookie jar, so it is
 * registered `scoped` and only resolves from a request scope; asking the root
 * container for it throws rather than hand one visitor's cookies to the next.
 */
export class SessionService {
	constructor(
		private readonly cookies: Cookies,
		private readonly secure: boolean,
	) {}

	static isExpired(stored: StoredSession, skewSeconds = 60): boolean {
		return stored.expires_at - skewSeconds <= nowInSeconds();
	}

	read(): StoredSession | null {
		const raw = this.cookies.get(COOKIE_NAME);
		if (!raw) {
			return null;
		}
		try {
			const parsed = JSON.parse(raw) as StoredSession;
			if (!(parsed.access_token && parsed.refresh_token && parsed.user)) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}

	write(session: AuthSession): StoredSession {
		const stored: StoredSession = {
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			expires_at: nowInSeconds() + session.expires_in,
			user: session.user,
		};
		this.cookies.set(
			COOKIE_NAME,
			JSON.stringify(stored),
			this.#cookieOptions(),
		);
		return stored;
	}

	clear(): void {
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
	 * stored token, and persists a refreshed session straight back to the
	 * cookie through this same service.
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
			expires_in: Math.max(0, stored.expires_at - nowInSeconds()),
			refresh_token: stored.refresh_token,
			user: stored.user,
		};
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
