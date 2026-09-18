import { downloads } from "#lib/downloads/manager.svelte.js";
import { searchHistory } from "#lib/search/search-history.svelte.js";
import { sync } from "./store.svelte.ts";

/**
 * Drops everything the app keeps in this browser: the IndexedDB mirror of
 * every account's library / progress / history, the unflushed write queue, and
 * recent searches. Downloads keep their files (they are hours to fetch again)
 * but stop, and the offline page stops listing them.
 *
 * Signing out only clears cookies, so without this the previous account's
 * mirror stays on the device for whoever signs in next. Called from the auth
 * layout, which is the one place every way of losing a session converges on
 * (sign-out, an expired refresh token, an eviction by the instance lock) : the
 * layout's load redirects anyone who still has a session, so arriving there
 * means there is nothing left to keep.
 */
export async function forgetLocalData(): Promise<void> {
	searchHistory.forget();
	downloads.forget();
	await sync.forget();
}
