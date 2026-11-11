import type { RequestEvent } from "@sveltejs/kit";
import { BuiltInBackend } from "#lib/backend/handler.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { LocalDownloads } from "#lib/downloads/local-downloads.js";
import { LOCAL_DOWNLOADS } from "#lib/downloads/tokens.js";
import { refreshSession } from "#lib/nuvio/backend.js";
import { registerUserDataServices } from "#lib/userdata/server.js";
import { dev } from "$app/env";
import {
	NUVIO_ADMIN_EMAILS,
	NUVIO_DATA_DIR,
	NUVIO_DOWNLOADS_DIR,
	NUVIO_LOG_FORMAT,
	NUVIO_LOG_LEVEL,
	NUVIO_SESSION_SECRET,
} from "$app/env/private";
import { resolve } from "$app/paths";
import { ACTIVITY, ActivityTracker } from "./activity.service.ts";
import { AdminService } from "./admin.service.ts";
import {
	ADMIN_NOTIFICATIONS,
	AdminNotifierService,
} from "./admin-notifier.service.ts";
import { Container } from "./container.ts";
import { DatabaseService } from "./database.service.ts";
import { consoleSink, Logger } from "./logger.service.ts";
import { MAILER_SERVICE, MailerService } from "./mailer.service.ts";
import { RateLimiter } from "./rate-limit.service.ts";
import { SessionService } from "./session.service.ts";
import { loadSessionSecret } from "./session-secret.ts";
import { SESSION_STORE, SessionStore } from "./session-store.service.ts";
import {
	ADMIN,
	ADMIN_NOTIFIER,
	COOKIES,
	DATABASE,
	LOGGER,
	MAILER,
	NUVIO_TOKENS,
	RATE_LIMITER,
	REQUEST_EVENT,
	SESSION,
	SESSION_SECRET,
} from "./tokens.ts";

/**
 * Composition root for the process-wide server singletons.
 *
 * **Server only**: this module reads `$app/env/private`, so importing it from
 * anything the browser bundles is a build error rather than a leak. Anything
 * touching a request is registered `scoped` and reached through
 * {@link createRequestScope}, not from here.
 */
export const serverServices = new Container("server");

serverServices
	.register(
		LOGGER,
		() =>
			new Logger(NUVIO_LOG_LEVEL || (dev ? "debug" : "info"), consoleSink, {
				format: NUVIO_LOG_FORMAT,
			}),
	)
	.register(DATABASE, (c) => new DatabaseService(NUVIO_DATA_DIR, c.get(LOGGER)))
	.register(ADMIN, () => new AdminService(NUVIO_ADMIN_EMAILS ?? ""))
	.register(RATE_LIMITER, () => new RateLimiter())
	// A singleton so the file is read (or created) once, on the first request.
	.register(SESSION_SECRET, () =>
		loadSessionSecret(NUVIO_SESSION_SECRET, NUVIO_DATA_DIR),
	)
	// One store for the process: its single-flight refresh only works if
	// requests and the background sync share it.
	.register(
		SESSION_STORE,
		(c) =>
			new SessionStore(
				c.get(DATABASE),
				c.get(SESSION_SECRET),
				(refreshToken, backend) =>
					refreshSession(refreshToken, backend, c.get(BUILT_IN_BACKEND)),
				c.get(LOGGER).scoped("Sessions"),
			),
	)
	.register(NUVIO_TOKENS, (c) => c.get(SESSION_STORE))
	.register(
		BUILT_IN_BACKEND,
		(c) =>
			new BuiltInBackend(c.get(DATABASE), c.get(SESSION_SECRET), {
				limiter: c.get(RATE_LIMITER),
				admin: c.get(ADMIN),
				logger: c.get(LOGGER).scoped("BuiltInBackend"),
				mailer: c.get(MAILER_SERVICE),
				pages: {
					resetPassword: resolve("auth/reset-password"),
					confirmEmail: resolve("auth/confirm-email"),
				},
			}),
	)
	.register(
		MAILER_SERVICE,
		(c) =>
			new MailerService(
				c.get(DATABASE),
				c.get(SESSION_SECRET),
				c.get(LOGGER).scoped("Mailer"),
			),
	)
	.register(MAILER, (c) => c.get(MAILER_SERVICE))
	.register(
		ADMIN_NOTIFICATIONS,
		(c) =>
			new AdminNotifierService(
				c.get(DATABASE),
				c.get(ADMIN),
				c.get(MAILER),
				c.get(LOGGER).scoped("AdminNotifier"),
			),
	)
	.register(ADMIN_NOTIFIER, (c) => c.get(ADMIN_NOTIFICATIONS))
	// The desktop app's downloads, in a folder on the user's computer.
	.register(LOCAL_DOWNLOADS, (c) =>
		NUVIO_DOWNLOADS_DIR
			? new LocalDownloads(
					NUVIO_DOWNLOADS_DIR,
					c.get(LOGGER).scoped("LocalDownloads"),
				)
			: null,
	)
	.register(
		ACTIVITY,
		(c) =>
			new ActivityTracker(c.get(DATABASE), c.get(LOGGER).scoped("Activity")),
	)
	.register(
		SESSION,
		(c) =>
			new SessionService(
				c.get(COOKIES),
				c.get(REQUEST_EVENT).url.protocol === "https:",
				c.get(SESSION_SECRET),
				c.get(SESSION_STORE),
			),
		"scoped",
	);

// Library / progress / history: this instance's SQLite, mirrored to Nuvio in
// the background (needs NUVIO_TOKENS above).
registerUserDataServices(serverServices);

/**
 * Builds this request's container. `hooks.server.ts` calls it once per request,
 * hangs the result on `event.locals.services`, and disposes it when the
 * response is done. The cookie jar and event are `provide`d rather than built,
 * because only the request has them.
 */
export function createRequestScope(event: RequestEvent): Container {
	return serverServices
		.createScope(`request:${event.url.pathname}`)
		.provide(COOKIES, event.cookies)
		.provide(REQUEST_EVENT, event);
}
