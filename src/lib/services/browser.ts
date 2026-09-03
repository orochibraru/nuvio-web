import { browser } from "$app/env";
import { Container } from "./container.ts";
import { PeopleService } from "./people.service.ts";
import { QueryCacheService } from "./query-cache.service.ts";
import { RequestBudget } from "./request-budget.service.ts";
import { PEOPLE, QUERY_CACHE, REQUEST_BUDGET } from "./tokens.ts";

const GLOBAL_REQUEST_BUDGET = 6;

/**
 * Composition root for services whose lifetime is the tab.
 *
 * Module-level singletons are safe here in a way they are not on the server:
 * none of these hold user-specific state (`PeopleService` memoises public
 * Wikipedia summaries), and the budget only means anything if every caller
 * shares one. See `./server.ts` for why request state gets a scope instead.
 */
export const browserServices = new Container("browser");

browserServices
	.register(REQUEST_BUDGET, () => new RequestBudget(GLOBAL_REQUEST_BUDGET))
	.register(PEOPLE, (c) => new PeopleService(c.get(REQUEST_BUDGET)))
	.register(
		QUERY_CACHE,
		() => new QueryCacheService(browser ? localStorage : null),
	);
