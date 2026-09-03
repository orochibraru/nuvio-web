import type { Cookies, RequestEvent } from "@sveltejs/kit";
import type { AdminService } from "./admin.service.ts";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";
import type { PeopleService } from "./people.service.ts";
import type { QueryCacheService } from "./query-cache.service.ts";
import type { RequestBudget } from "./request-budget.service.ts";
import type { SessionService } from "./session.service.ts";

// Every resolvable service in one list. Type-only imports on purpose: a token
// names a service without pulling its module into the bundle, which is what
// keeps the server-only services out of the browser build.

// -- Server, process-wide -----------------------------------------------------
export const LOGGER = serviceToken<Logger>("Logger");
export const DATABASE = serviceToken<DatabaseService>("DatabaseService");
export const ADMIN = serviceToken<AdminService>("AdminService");

// -- Server, per request ------------------------------------------------------
/** The request's cookie jar, provided into each request scope. */
export const COOKIES = serviceToken<Cookies>("Cookies");
/** The request event itself, provided into each request scope. */
export const REQUEST_EVENT = serviceToken<RequestEvent>("RequestEvent");
export const SESSION = serviceToken<SessionService>("SessionService");

// -- Browser ------------------------------------------------------------------
export const REQUEST_BUDGET = serviceToken<RequestBudget>("RequestBudget");
export const PEOPLE = serviceToken<PeopleService>("PeopleService");
export const QUERY_CACHE = serviceToken<QueryCacheService>("QueryCacheService");
