import type { Cookies, RequestEvent } from "@sveltejs/kit";
import {
	type AuthSession,
	NuvioClient,
	type NuvioUser,
} from "#lib/nuvio/index.js";
import { dev } from "$app/env";

const COOKIE_NAME = "nuvio_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface StoredSession {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	user: NuvioUser;
}

export function readStoredSession(cookies: Cookies): StoredSession | null {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as StoredSession;
		if (!parsed.access_token || !parsed.refresh_token || !parsed.user)
			return null;
		return parsed;
	} catch {
		return null;
	}
}

export function writeStoredSession(
	cookies: Cookies,
	session: AuthSession,
): StoredSession {
	const stored: StoredSession = {
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: nowInSeconds() + session.expires_in,
		user: session.user,
	};
	cookies.set(COOKIE_NAME, JSON.stringify(stored), {
		path: "/",
		httpOnly: true,
		secure: !dev,
		sameSite: "lax",
		maxAge: COOKIE_MAX_AGE,
	});
	return stored;
}

export function clearStoredSession(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: "/" });
}

export function isExpired(stored: StoredSession, skewSeconds = 60): boolean {
	return stored.expires_at - skewSeconds <= nowInSeconds();
}

function toAuthSession(stored: StoredSession): AuthSession {
	return {
		access_token: stored.access_token,
		token_type: "bearer",
		expires_in: Math.max(0, stored.expires_at - nowInSeconds()),
		refresh_token: stored.refresh_token,
		user: stored.user,
	};
}

function nowInSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

/** Client bound to the request: uses the request `fetch`, carries the stored token, and persists refreshes back to the cookie. */
export function createServerClient(
	event: RequestEvent,
	stored: StoredSession | null,
): NuvioClient {
	return new NuvioClient({
		fetch: event.fetch,
		session: stored ? toAuthSession(stored) : null,
		onSessionChange: (session) => {
			if (session) writeStoredSession(event.cookies, session);
			else clearStoredSession(event.cookies);
		},
	});
}
