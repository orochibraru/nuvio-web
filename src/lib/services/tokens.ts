import type { Cookies, RequestEvent } from "@sveltejs/kit";
import type { AdminNotifier, MailSender } from "#lib/notifications/types.js";
import type { NuvioBackend } from "#lib/nuvio/backend.js";
import type { AdminService } from "./admin.service.ts";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";
import type { PeopleService } from "./people.service.ts";
import type { RateLimiter } from "./rate-limit.service.ts";
import type { RequestBudget } from "./request-budget.service.ts";
import type { SessionService } from "./session.service.ts";

// Every resolvable service in one list. Type-only imports on purpose: a token
// names a service without pulling its module into the bundle, which is what
// keeps the server-only services out of the browser build.

// -- Server, process-wide -----------------------------------------------------
export const LOGGER = serviceToken<Logger>("Logger");
export const DATABASE = serviceToken<DatabaseService>("DatabaseService");
export const ADMIN = serviceToken<AdminService>("AdminService");
/** The key `SessionService` signs the session cookie with. */
export const SESSION_SECRET = serviceToken<string>("SessionSecret");

export interface NuvioCredentials {
	accessToken: string;
	/** The backend that issued the token; null for the official Nuvio API. */
	backend: NuvioBackend | null;
}

/**
 * A valid Nuvio access token for an account (see `accountKey`), outside any
 * request: the background Nuvio sync uses it. The session store implements it
 * and owns refreshing, so requests and the sync never race on a rotating
 * refresh token. `null` when the account has no live session on this instance.
 */
export interface NuvioTokenSource {
	credentialsFor: (accountKey: string) => Promise<NuvioCredentials | null>;
}
export const NUVIO_TOKENS = serviceToken<NuvioTokenSource>("NuvioTokenSource");
/** Throttles sign-in and sign-up attempts, per client address and per email. */
export const RATE_LIMITER = serviceToken<RateLimiter>("RateLimiter");
/** Records an admin notification and emails the admins who opted in. */
export const ADMIN_NOTIFIER = serviceToken<AdminNotifier>("AdminNotifier");
/** Sends mail through the SMTP server configured on the admin page. */
export const MAILER = serviceToken<MailSender>("MailSender");

// -- Server, per request ------------------------------------------------------
/** The request's cookie jar, provided into each request scope. */
export const COOKIES = serviceToken<Cookies>("Cookies");
/** The request event itself, provided into each request scope. */
export const REQUEST_EVENT = serviceToken<RequestEvent>("RequestEvent");
export const SESSION = serviceToken<SessionService>("SessionService");

// -- Browser ------------------------------------------------------------------
export const REQUEST_BUDGET = serviceToken<RequestBudget>("RequestBudget");
export const PEOPLE = serviceToken<PeopleService>("PeopleService");
