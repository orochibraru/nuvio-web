import type { RequestEvent } from "@sveltejs/kit";
import { NuvioClient } from "#lib/nuvio/index.js";
import { registerUserDataServices } from "#lib/userdata/server.js";
import { dev } from "$app/env";
import {
	NUVIO_ADMIN_EMAILS,
	NUVIO_DATA_DIR,
	NUVIO_LOG_FORMAT,
	NUVIO_LOG_LEVEL,
	NUVIO_SESSION_SECRET,
} from "$app/env/private";
import { AdminService } from "./admin.service.ts";
import { Container } from "./container.ts";
import { DatabaseService } from "./database.service.ts";
import { consoleSink, Logger } from "./logger.service.ts";
import { SessionService } from "./session.service.ts";
import { loadSessionSecret } from "./session-secret.ts";
import { SESSION_STORE, SessionStore } from "./session-store.service.ts";
import {
	ADMIN,
	COOKIES,
	DATABASE,
	LOGGER,
	NUVIO_TOKENS,
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
				(refreshToken) => new NuvioClient().refreshSession(refreshToken),
				c.get(LOGGER).scoped("Sessions"),
			),
	)
	.register(NUVIO_TOKENS, (c) => c.get(SESSION_STORE))
	.register(
		SESSION,
		(c) =>
			new SessionService(
				c.get(COOKIES),
				!dev,
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
