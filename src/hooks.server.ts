import type { RequestEvent } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { canSignIn } from "#lib/admin/admin-data.js";
import { NuvioApiError, NuvioClient } from "#lib/nuvio/index.js";
import {
	ADMIN,
	type Container,
	DATABASE,
	LOGGER,
	SESSION,
	SessionService,
	type StoredSession,
} from "#lib/services/index.js";
import { createRequestScope, serverServices } from "#lib/services/server.js";
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
	serverServices
		.get(LOGGER)
		.error(`Error on ${event.request.method} ${event.url.pathname}`, {
			errorId,
			error: error instanceof Error ? error : "Unknown error",
		});

	return {
		errorId,
		message:
			error instanceof Error && dev
				? error.message
				: "An unknown error occurred.",
	};
};

function logAccess(
	services: Container,
	event: RequestEvent,
	status: number,
	startedAt: number,
): void {
	const logger = services.get(LOGGER);
	const ms = Math.round(performance.now() - startedAt);
	const message = `${event.request.method} ${event.url.pathname}`;
	if (status >= 500) {
		logger.error(message, { status, ms });
	} else if (status >= 400) {
		logger.warn(message, { status, ms });
	} else {
		logger.info(message, { status, ms });
	}
}

/**
 * Locking the instance has to reach sessions that already exist, or the lock
 * does nothing for 30 days : the cookie outlives the decision. Checked per
 * request against the local database, which is a single indexed lookup.
 */
function evictIfLocked(services: Container, stored: StoredSession): boolean {
	const db = services.get(DATABASE).tryConnect();
	const email = stored.user.email;
	const isAdmin = services.get(ADMIN).isAdmin(email);
	if (!(db && email) || canSignIn(db, email, isAdmin)) {
		return false;
	}
	services
		.get(LOGGER)
		.warn("Signed out an existing session: instance is locked", { email });
	services.get(SESSION).clear();
	return true;
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = performance.now();
	const services = createRequestScope(event);
	event.locals.services = services;
	const session = services.get(SESSION);
	let stored = session.read();

	if (stored && SessionService.isExpired(stored)) {
		try {
			const refreshed = await new NuvioClient({
				fetch: event.fetch,
			}).refreshSession(stored.refresh_token);
			stored = session.write(refreshed);
		} catch (error) {
			if (!(error instanceof NuvioApiError)) {
				throw error;
			}
			session.clear();
			stored = null;
		}
	}

	if (stored && evictIfLocked(services, stored)) {
		stored = null;
	}

	event.locals.session = stored ? { user: stored.user } : null;
	event.locals.profileId = stored ? session.readProfileId() : null;
	event.locals.nuvio = session.createNuvioClient(event.fetch, stored);

	try {
		const response = await resolve(event);
		applySecurityHeaders(response.headers);
		logAccess(services, event, response.status, startedAt);
		return response;
	} finally {
		// Drops this request's scoped instances; the process-wide singletons on
		// the parent container are untouched.
		services.dispose();
	}
};
