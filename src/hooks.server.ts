import type { Database } from "bun:sqlite";
import process from "node:process";
import type { RequestEvent } from "@sveltejs/kit";
import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence,
} from "@sveltejs/kit/hooks";
import { canSignIn, isLocked } from "#lib/admin/admin-data.js";
import {
	allowCustomBackendsUnlessSet,
	type BackendPolicy,
	isBannedBackend,
	isDefaultBackend,
	policyOrDefault,
} from "#lib/admin/backends-data.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { makeErrorId } from "#lib/core/error-id.js";
import { m } from "#lib/i18n/index.js";
import { i18nHandle } from "#lib/i18n/server.js";
import { backendOrigin } from "#lib/nuvio/backend.js";
import { NuvioApiError } from "#lib/nuvio/index.js";
import { ACTIVITY } from "#lib/services/activity.service.js";
import {
	ADMIN,
	type AdminService,
	type Container,
	DATABASE,
	LOGGER,
	SESSION,
} from "#lib/services/index.js";
import { createRequestScope, serverServices } from "#lib/services/server.js";
import type { StoredSession } from "#lib/services/session.service.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { dev } from "$app/env";
import { NUVIO_ALLOW_CUSTOM_BACKENDS } from "$app/env/private";

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
// `'wasm-unsafe-eval'` is for the player's in-browser audio decoders.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	dev
		? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
		: "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
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
	// A route with a stricter policy of its own (the download proxy) keeps it.
	if (!headers.has("content-security-policy")) {
		headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
	}
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
 * platform make on their own, whose 404s say nothing about this app, and the
 * client's own traffic : remote function calls and the `__data.json` a
 * revalidation fetches, which SvelteKit reports under the page's path.
 */
function isLogNoise(event: RequestEvent): boolean {
	if (event.isRemoteRequest || event.isDataRequest) {
		return true;
	}
	// The raw path: SvelteKit strips `__data.json` from `event.url`.
	const pathname = new URL(event.request.url).pathname;
	return (
		pathname === "/favicon.ico" ||
		pathname === "/api/health" ||
		pathname === "/service-worker.js" ||
		pathname.endsWith("/__data.json") ||
		pathname.startsWith("/.well-known/") ||
		pathname.startsWith("/@") ||
		pathname.startsWith("/_app/") ||
		pathname.startsWith("/node_modules/") ||
		pathname.startsWith("/src/")
	);
}

/**
 * Addon metadata the browser may keep for 15 minutes, so going back to a
 * title or a catalog doesn't re-run the addon fan-out. `private` keeps it out
 * of every shared cache : nothing is cached on this server or in front of it.
 * `Vary: Cookie` splits it per session and profile (addons are per profile).
 *
 * Remote queries: only the ones that return addon meta and are never
 * `.refresh()`ed. Page data: a title's page and Discover, but only on a
 * navigation. SvelteKit's `x-sveltekit-invalidated` mask leaves an
 * already-loaded layout at `0` then, while `invalidateAll()` (a Retry button)
 * sends all `1`s and must reach the server.
 */
const CACHED_QUERIES = new Set([
	"getMeta",
	"playbackMeta",
	"browseCatalog",
	"similarTitles",
]);
const CACHED_PAGES = new Set([
	"/(protected)/(app)/(watch)/detail/[type]/[id]",
	"/(protected)/(app)/discover",
]);

function isBrowserCacheable(event: RequestEvent, status: number): boolean {
	if (event.request.method !== "GET" || status !== 200) {
		return false;
	}
	if (event.isRemoteRequest) {
		return CACHED_QUERIES.has(event.url.pathname.split("/").at(-1) ?? "");
	}
	if (!(event.isDataRequest && CACHED_PAGES.has(event.route.id ?? ""))) {
		return false;
	}
	// Read off the raw request: SvelteKit strips the mask from `event.url`.
	const invalidated = new URL(event.request.url).searchParams.get(
		"x-sveltekit-invalidated",
	);
	return invalidated?.includes("0") ?? false;
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

function isAllowed(
	db: Database,
	policy: BackendPolicy,
	stored: StoredSession,
	admin: AdminService,
): boolean {
	const backend = stored.backend;
	if (isDefaultBackend(backend, policy)) {
		const email = stored.user.email;
		return !email || canSignIn(db, email, admin.isAdmin(email, true));
	}
	// An admin default that has since been replaced is trusted no more.
	if (backend?.trusted) {
		return false;
	}
	// The official API next to an admin default: always on offer, but its email
	// is not this instance's to trust.
	if (backend === null) {
		return !isLocked(db);
	}
	// A user's own backend: its email can't be trusted for the allowlist.
	return (
		policy.customAllowed && !isLocked(db) && !isBannedBackend(db, backend.url)
	);
}

/**
 * Locking the instance, disallowing or banning a custom backend, or moving the
 * default backend has to reach sessions that already exist, or the decision
 * does nothing for 30 days : the session outlives it. Checked per request
 * against the local database, a few indexed lookups. Drops every session the
 * account has here, so the background sync stops for them too.
 */
function evictIfNotAllowed(
	services: Container,
	db: Database | null,
	policy: BackendPolicy,
	stored: StoredSession,
): boolean {
	if (!db || isAllowed(db, policy, stored, services.get(ADMIN))) {
		return false;
	}
	services.get(LOGGER).warn("Signed out an existing session: not allowed", {
		email: stored.user.email,
		backend: stored.backend ? backendOrigin(stored.backend.url) : "official",
	});
	services.get(SESSION_STORE).deleteAllForUser(stored.accountKey);
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

	const db = services.get(DATABASE).tryConnect();
	const policy = policyOrDefault(db);
	if (stored && evictIfNotAllowed(services, db, policy, stored)) {
		stored = null;
	}
	if (stored) {
		services.get(ACTIVITY).seen(stored.user.email ?? stored.accountKey);
	}

	event.locals.session = stored
		? {
				user: stored.user,
				accountKey: stored.accountKey,
				backend: stored.backend?.url ?? null,
				trusted: isDefaultBackend(stored.backend, policy),
			}
		: null;
	event.locals.profileId = stored ? session.readProfileId() : null;
	event.locals.nuvio = session.createNuvioClient(
		event.fetch,
		stored,
		services.get(BUILT_IN_BACKEND),
	);

	try {
		const response = await resolve(event);
		applySecurityHeaders(response.headers);
		if (isBrowserCacheable(event, response.status)) {
			response.headers.set("cache-control", "private, max-age=900");
			response.headers.append("vary", "Cookie");
		}
		if (!isLogNoise(event)) {
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
/** `NUVIO_ALLOW_CUSTOM_BACKENDS` is a starting point: an admin's own choice on /admin wins. */
export const init: ServerInit = () => {
	if (!NUVIO_ALLOW_CUSTOM_BACKENDS) {
		return;
	}
	const db = serverServices.get(DATABASE).tryConnect();
	if (db) {
		allowCustomBackendsUnlessSet(db);
	}
};

export const handle = sequence(i18nHandle, appHandle);

// The adapter emits it on SIGTERM / SIGINT once in-flight requests are done
// (or cut off at `SHUTDOWN_TIMEOUT`): let background syncs finish, then close
// SQLite. Not under `vite dev`, which never emits it and re-imports this file.
if (!dev) {
	process.on("sveltekit:shutdown", async (reason: string) => {
		hooksLogger().info("Shutting down", { reason });
		await serverServices.shutdown();
	});
}
