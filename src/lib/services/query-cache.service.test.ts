import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUERY_TTL, QueryCacheService } from "./query-cache.service.ts";

// Node's test env has no `localStorage` : a plain in-memory shim is enough.
// The service takes its storage as a constructor argument, so this needs no
// `vi.stubGlobal` and no `$app/env` mock.
class MemoryStorage {
	readonly #map = new Map<string, string>();
	get length() {
		return this.#map.size;
	}
	getItem(key: string) {
		return this.#map.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.#map.set(key, value);
	}
	removeItem(key: string) {
		this.#map.delete(key);
	}
	clear() {
		this.#map.clear();
	}
	key(index: number) {
		return [...this.#map.keys()][index] ?? null;
	}
}

/** Minimal stand-in for a SvelteKit `RemoteQuery` proxy. */
function fakeQuery<T>(resolved?: T) {
	let value = resolved;
	let ready = resolved !== undefined;
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return {
		get ready() {
			return ready;
		},
		set(v: T) {
			value = v;
			ready = true;
		},
		get current() {
			return value;
		},
		// biome-ignore lint/suspicious/noThenProperty: stands in for a real RemoteQuery, itself a thenable.
		then(onFulfilled: (v: T) => void) {
			return promise.then(onFulfilled);
		},
		catch() {
			return promise.catch(() => undefined);
		},
		resolve(v: T) {
			value = v;
			ready = true;
			resolve(v);
		},
	};
}

let storage: MemoryStorage;
let cache: QueryCacheService;

beforeEach(() => {
	storage = new MemoryStorage();
	cache = new QueryCacheService(storage as unknown as Storage);
});

describe("prime", () => {
	it("primes a fresh query from a cached value and skips the network path", () => {
		const first = fakeQuery<{ n: number }>();
		cache.prime(first as never, "k", QUERY_TTL.catalog);
		first.resolve({ n: 1 });

		return Promise.resolve().then(() => {
			const second = fakeQuery<{ n: number }>();
			cache.prime(second as never, "k", QUERY_TTL.catalog);
			expect(second.current).toEqual({ n: 1 });
			expect(second.ready).toBe(true);
		});
	});

	it("never overwrites a query that already resolved live", () => {
		cache.remember("k", { n: 99 });
		const already = fakeQuery<{ n: number }>({ n: 1 });
		cache.prime(already as never, "k", QUERY_TTL.catalog);
		expect(already.current).toEqual({ n: 1 });
	});

	it("ignores an expired entry and leaves the query to fetch normally", () => {
		storage.setItem(
			"nuvio:query-cache",
			JSON.stringify({
				k: { value: { n: 1 }, cachedAt: Date.now() - 1_000_000 },
			}),
		);
		const stale = fakeQuery<{ n: number }>();
		cache.prime(stale as never, "k", 1000);
		expect(stale.ready).toBe(false);
	});

	it("does nothing without storage, which is how it behaves during SSR", () => {
		const server = fakeQuery<{ n: number }>();
		new QueryCacheService(null).prime(server as never, "k", QUERY_TTL.catalog);
		expect(server.ready).toBe(false);
	});
});

describe("eviction", () => {
	// Fake timers so the three entries get distinct `cachedAt` stamps : with
	// a real clock all three land in the same millisecond and "newest" is a
	// coin flip.
	it("keeps only the newest entries once it is over the cap", () => {
		vi.useFakeTimers();
		try {
			const small = new QueryCacheService(storage as unknown as Storage, 2);
			small.remember("a", 1);
			vi.advanceTimersByTime(10);
			small.remember("b", 2);
			vi.advanceTimersByTime(10);
			small.remember("c", 3);
			expect(Object.keys(small.read()).sort()).toEqual(["b", "c"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("clear drops everything", () => {
		cache.remember("a", 1);
		cache.clear();
		expect(cache.read()).toEqual({});
	});
});
