import type { RequestEvent } from "@sveltejs/kit";
import {
	type Handle,
	type HandleServerError,
	sequence,
} from "@sveltejs/kit/hooks";
import { canSignIn } from "#lib/admin/admin-data.js";
import { makeErrorId } from "#lib/core/error-id.js";
import { m } from "#lib/i18n/index.js";
import { i18nHandle } from "#lib/i18n/server.js";
import { NuvioApiError } from "#lib/nuvio/index.js";
import {
	ADMIN,
	type Container,
	DATABASE,
	LOGGER,
	SESSION,
} from "#lib/services/index.js";
import { createRequestScope, serverServices } from "#lib/services/server.js";
import type { StoredSession } from "#lib/services/session.service.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { dev } from "$app/env";

/**
 * Resolved per call rather than at module load: `handleError` can fire before
 * anything else has touched the container, and a module-level `.get()` would
 * pin the logger into this module's import side effects.
 */
function hooksLogger() {
	return serverServices.get(LOGGER).scoped("Hooks");
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

/** The readable part of whatever `handleError` was handed, for the log line. */
function describe(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	if (typeof error === "object" && error !== null && "message" in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}

export const handleError: HandleServerError = ({ event, error, kind }) => {
	// SvelteKit 3 routes app + framework errors through here too; a 404 is
	// noise, not a bug.
	if (kind === "framework" && error.status === 404) {
		return;
	}
	const errorId = makeErrorId();
	const message = `Error on ${event.request.method} ${event.url.pathname}`;
	const fields = { errorId, error: describe(error) };

	if (kind === "unknown") {
		hooksLogger().error(message, fields);
		// Only an unknown error carries a message that could leak internals (a
		// driver string, a path, a query), so it is the only kind whose message
		// is replaced in production. Plain object, never an `Error` instance:
		// this becomes `App.Error` (app.d.ts) and is serialized to the client
		// with devalue, which can't stringify a non-POJO and would turn every
		// uncaught error into an unrelated-looking "Cannot stringify arbitrary
		// non-POJOs" 500.
		return {
			errorId,
			message: dev ? describe(error) : m.error_unknown(),
		};
	}

	// A 403 from a guard, or a rejected remote-function argument, is the app
	// working as designed : worth a line, not an ERROR line.
	hooksLogger().warn(message, fields);
	// Returning only `errorId` lets SvelteKit keep the message it already has
	// (the body passed to `error(...)`, or its own safe text for a framework
	// error) : the one actually written for a user to read.
	return { errorId };
};

/**
 * Requests nobody wants an access line for: probes the browser and the
 * platform make on their own, whose 404s say nothing about this app.
 */
function isLogNoise(pathname: string): boolean {
	return (
		pathname === "/favicon.ico" ||
		pathname.startsWith("/.well-known/") ||
		pathname.startsWith("/@") ||
		pathname.startsWith("/_app/")
	);
}

function logAccess(
	services: Container,
	event: RequestEvent,
	status: number,
	startedAt: number,
): void {
	const logger = services.get(LOGGER).scoped("Hooks");
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
 * does nothing for 30 days : the session outlives the decision. Checked per
 * request against the local database, which is a single indexed lookup. Drops
 * every session the user has here, so the background sync stops for them too.
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
	services.get(SESSION_STORE).deleteAllForUser(stored.user.id);
	services.get(SESSION).clear();
	return true;
}

export const appHandle: Handle = async ({ event, resolve }) => {
	const startedAt = performance.now();
	const services = createRequestScope(event);
	event.locals.services = services;
	const session = services.get(SESSION);
	let stored: StoredSession | null;
	try {
		// Refreshes through the session store when due : the one refresh path
		// the background sync shares, so the two never race on a rotated token.
		stored = await session.read();
	} catch (error) {
		if (!(error instanceof NuvioApiError)) {
			throw error;
		}
		// Upstream hiccup (5xx, 429) mid-refresh: this request goes signed-out,
		// the session is kept, and the next request retries.
		stored = null;
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
		if (!isLogNoise(event.url.pathname)) {
			logAccess(services, event, response.status, startedAt);
		}
		return response;
	} finally {
		// Drops this request's scoped instances; the process-wide singletons on
		// the parent container are untouched.
		services.dispose();
	}
};

// Locale first, so everything below (and the render) runs in the visitor's
// language.
export const handle = sequence(i18nHandle, appHandle);
