import { browser } from "$app/env";
import type { RemoteQuery } from "$app/server";

/**
 * TTL cache for client-side addon queries (`getMeta` / `homeRows` /
 * `browseCatalog` / `similarTitles` / `searchCatalogs`). SvelteKit's own
 * query cache is reference-counted: it evicts a result as soon as nothing on
 * screen still references those args, so navigating away and back re-fans-out
 * to the addons every time. This persists the last good value to
 * `localStorage`, keyed by a caller-supplied key, and — while the value is
 * still fresh — primes the query's `set()` before it ever starts, which
 * pre-empties the network call entirely instead of just racing it.
 *
 * Callers must fold anything the result depends on (profile id, args) into
 * `key` — a stale hit from a different profile's addon set would otherwise
 * leak into this one. See `#lib/addons/addons.remote.ts` call sites.
 *
 * `query.set()` mutates the query's reactive state, so `ttlPrime` must run
 * from an `$effect`, never from inside a `$derived` — Svelte forbids state
 * mutation during a derived's evaluation (`state_unsafe_mutation`), even
 * several calls deep. Typical shape:
 *
 * ```svelte
 * const metaQuery = $derived(getMeta({ type, id }));
 * $effect(() => {
 *   ttlPrime(metaQuery, `meta:${profileIndex}:${type}:${id}`, QUERY_TTL.meta);
 * });
 * ```
 */

interface CacheEntry {
	value: unknown;
	cachedAt: number;
}

const STORAGE_KEY = "nuvio:query-cache";
const MAX_ENTRIES = 80;

function readStore(): Record<string, CacheEntry> {
	if (!browser) {
		return {};
	}
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
	} catch {
		return {};
	}
}

function writeStore(store: Record<string, CacheEntry>): void {
	try {
		const entries = Object.entries(store).sort(
			(a, b) => b[1].cachedAt - a[1].cachedAt,
		);
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))),
		);
	} catch {
		// storage full / unavailable — caching just won't kick in
	}
}

/**
 * Prime `query` from the TTL cache when a fresh entry exists for `key` — this
 * skips the query's network call entirely. Otherwise let it run as normal and
 * persist the result once it resolves. A `query` that's already resolved
 * (reused live from another component on the page) is left alone so a cache
 * hit can never clobber fresher in-memory data. Must be called from an
 * `$effect` — see the module doc.
 */
export function ttlPrime<T>(
	query: RemoteQuery<T>,
	key: string,
	ttlMs: number,
): void {
	if (!browser || query.ready) {
		return;
	}
	const cached = readStore()[key];
	if (cached && Date.now() - cached.cachedAt < ttlMs) {
		query.set(cached.value as T);
		return;
	}
	query
		.then((value: T) => {
			const store = readStore();
			store[key] = { value, cachedAt: Date.now() };
			writeStore(store);
		})
		.catch(() => {
			// query failed — nothing to cache
		});
}

/** Shared TTLs for the addon-query call sites — tune here, not per call site. */
export const QUERY_TTL = {
	/** Title metadata: essentially static once an addon has published it. */
	meta: 30 * 60_000,
	/** Catalog rows / "more like this": shift over a session, but slowly. */
	catalog: 10 * 60_000,
	/** Search results, keyed by term: cheap to keep, cheap to go stale. */
	search: 5 * 60_000,
} as const;
