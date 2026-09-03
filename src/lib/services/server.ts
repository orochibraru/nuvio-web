import type { RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/env";
import { NUVIO_ADMIN_EMAILS, NUVIO_DATA_DIR } from "$app/env/private";
import { AdminService } from "./admin.service.ts";
import { Container } from "./container.ts";
import { DatabaseService } from "./database.service.ts";
import { Logger } from "./logger.service.ts";
import { SessionService } from "./session.service.ts";
import {
	ADMIN,
	COOKIES,
	DATABASE,
	LOGGER,
	REQUEST_EVENT,
	SESSION,
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
	.register(LOGGER, () => new Logger(dev ? "debug" : "info"))
	.register(DATABASE, (c) => new DatabaseService(NUVIO_DATA_DIR, c.get(LOGGER)))
	.register(ADMIN, () => new AdminService(NUVIO_ADMIN_EMAILS ?? ""))
	.register(SESSION, (c) => new SessionService(c.get(COOKIES), !dev), "scoped");

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
