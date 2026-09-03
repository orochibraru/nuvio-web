import type { RemoteQuery } from "$app/server";

interface CacheEntry {
	value: unknown;
	cachedAt: number;
}

const STORAGE_KEY = "nuvio:query-cache";
const MAX_ENTRIES = 80;

/** Shared TTLs for the addon-query call sites : tune here, not per call site. */
export const QUERY_TTL = {
	/** Title metadata: essentially static once an addon has published it. */
	meta: 30 * 60_000,
	/** Catalog rows / "more like this": shift over a session, but slowly. */
	catalog: 10 * 60_000,
	/** Search results, keyed by term: cheap to keep, cheap to go stale. */
	search: 5 * 60_000,
} as const;

/**
 * TTL cache for the client-side addon queries, layered over SvelteKit's own.
 * SvelteKit's is reference-counted and evicts a result the moment nothing on
 * screen holds it, so navigating away and back re-fans-out to every addon;
 * this keeps the last good value in `localStorage` and serves it back.
 *
 * @param storage `null` during SSR, where every method is a no-op.
 */
export class QueryCacheService {
	constructor(
		private readonly storage: Storage | null,
		private readonly maxEntries = MAX_ENTRIES,
	) {}

	/**
	 * Serves `query` from cache while `key` is fresh, skipping its network call
	 * entirely; otherwise lets it run and stores the result. A query that has
	 * already resolved is left alone, so a cache hit can't clobber fresher data.
	 *
	 * Call this from an `$effect`, never from a `$derived` : it calls
	 * `query.set()`, and Svelte forbids state mutation inside a derived
	 * (`state_unsafe_mutation`) even several calls deep.
	 *
	 * @param key must fold in everything the result depends on (profile id,
	 * args). A hit from another profile's addon set would otherwise leak here.
	 */
	prime<T>(query: RemoteQuery<T>, key: string, ttlMs: number): void {
		if (!this.storage || query.ready) {
			return;
		}
		const cached = this.read()[key];
		if (cached && Date.now() - cached.cachedAt < ttlMs) {
			query.set(cached.value as T);
			return;
		}
		query
			.then((value: T) => {
				this.remember(key, value);
			})
			.catch(() => {
				// query failed : nothing to cache
			});
	}

	remember(key: string, value: unknown): void {
		const store = this.read();
		store[key] = { value, cachedAt: Date.now() };
		this.write(store);
	}

	clear(): void {
		try {
			this.storage?.removeItem(STORAGE_KEY);
		} catch {
			// storage unavailable : nothing cached to clear
		}
	}

	read(): Record<string, CacheEntry> {
		if (!this.storage) {
			return {};
		}
		try {
			return JSON.parse(this.storage.getItem(STORAGE_KEY) ?? "{}");
		} catch {
			return {};
		}
	}

	private write(store: Record<string, CacheEntry>): void {
		try {
			const entries = Object.entries(store).sort(
				(a, b) => b[1].cachedAt - a[1].cachedAt,
			);
			this.storage?.setItem(
				STORAGE_KEY,
				JSON.stringify(Object.fromEntries(entries.slice(0, this.maxEntries))),
			);
		} catch {
			// storage full / unavailable : caching just won't kick in
		}
	}
}
