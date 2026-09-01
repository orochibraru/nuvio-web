import type { RequestEvent } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { NuvioApiError, NuvioClient } from "#lib/nuvio/index.js";
import { log } from "#lib/server/log.js";
import {
	clearStoredSession,
	createServerClient,
	isExpired,
	readProfileId,
	readStoredSession,
	writeStoredSession,
} from "#lib/server/session.js";
import { dev } from "$app/env";

function makeErrorId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

// `'unsafe-inline'` on script-src is unavoidable without SvelteKit's CSP nonce
// integration (no svelte.config.js in this setup). Everything else is locked
// down. In dev, Vite's HMR websocket and eval need extra room.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	dev
		? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
		: "script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' https: http: data: blob:",
	"media-src 'self' https: blob:",
	"font-src 'self' data:",
	dev ? "connect-src 'self' https: ws: wss:" : "connect-src 'self' https:",
	"worker-src 'self' blob:",
	"frame-src https://www.youtube-nocookie.com",
	"frame-ancestors 'none'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");

function applySecurityHeaders(headers: Headers): void {
	headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
	headers.set("x-content-type-options", "nosniff");
	headers.set("x-frame-options", "DENY");
	headers.set("referrer-policy", "strict-origin-when-cross-origin");
	headers.set(
		"permissions-policy",
		"camera=(), microphone=(), geolocation=(), browsing-topics=()",
	);
	if (!dev) {
		headers.set(
			"strict-transport-security",
			"max-age=31536000; includeSubDomains",
		);
	}
}

export const handleError: HandleServerError = ({ event, error, kind }) => {
	// SvelteKit 3 routes expected + framework errors through here too; a 404 is
	// noise, not a bug.
	if (kind === "framework" && error.status === 404) {
		return;
	}
	const errorId = makeErrorId();
	log.error(`Error on ${event.request.method} ${event.url.pathname}`, {
		errorId,
		error: error instanceof Error ? error : "Unknown error",
	});

	return {
		errorId,
		message:
			error instanceof Error ? error.message : "An unknown error occurred.",
	};
};

function logAccess(
	event: RequestEvent,
	status: number,
	startedAt: number,
): void {
	const ms = Math.round(performance.now() - startedAt);
	const message = `${event.request.method} ${event.url.pathname}`;
	if (status >= 500) {
		log.error(message, { status, ms });
	} else if (status >= 400) {
		log.warn(message, { status, ms });
	} else {
		log.info(message, { status, ms });
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = performance.now();
	let stored = readStoredSession(event.cookies);

	if (stored && isExpired(stored)) {
		try {
			const refreshed = await new NuvioClient({
				fetch: event.fetch,
			}).refreshSession(stored.refresh_token);
			stored = writeStoredSession(event.cookies, refreshed);
		} catch (error) {
			if (!(error instanceof NuvioApiError)) {
				throw error;
			}
			clearStoredSession(event.cookies);
			stored = null;
		}
	}

	event.locals.session = stored ? { user: stored.user } : null;
	event.locals.profileId = stored ? readProfileId(event.cookies) : null;
	event.locals.nuvio = createServerClient(event, stored);

	const response = await resolve(event);
	applySecurityHeaders(response.headers);
	logAccess(event, response.status, startedAt);
	return response;
};
