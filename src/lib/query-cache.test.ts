import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { browser: true } }));

vi.mock("$app/env", () => ({
	get browser() {
		return state.browser;
	},
}));

// Node's test env has no `localStorage` : a plain in-memory shim is enough.
class MemoryStorage {
	readonly #map = new Map<string, string>();
	getItem(key: string) {
		return this.#map.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.#map.set(key, value);
	}
	clear() {
		this.#map.clear();
	}
}
vi.stubGlobal("localStorage", new MemoryStorage());

const { QUERY_TTL, ttlPrime } = await import("./query-cache.ts");

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

beforeEach(() => {
	state.browser = true;
	localStorage.clear();
});

describe("ttlPrime", () => {
	it("primes a fresh query from a cached value and skips the network path", () => {
		const first = fakeQuery<{ n: number }>();
		ttlPrime(first as any, "k", QUERY_TTL.catalog);
		first.resolve({ n: 1 });

		return Promise.resolve().then(() => {
			const second = fakeQuery<{ n: number }>();
			ttlPrime(second as any, "k", QUERY_TTL.catalog);
			expect(second.current).toEqual({ n: 1 });
			expect(second.ready).toBe(true);
		});
	});

	it("never overwrites a query that already resolved live", () => {
		localStorage.setItem(
			"nuvio:query-cache",
			JSON.stringify({ k: { value: { n: 99 }, cachedAt: Date.now() } }),
		);
		const already = fakeQuery<{ n: number }>({ n: 1 });
		ttlPrime(already as any, "k", QUERY_TTL.catalog);
		expect(already.current).toEqual({ n: 1 });
	});

	it("ignores an expired entry and leaves the query to fetch normally", () => {
		localStorage.setItem(
			"nuvio:query-cache",
			JSON.stringify({
				k: { value: { n: 1 }, cachedAt: Date.now() - 1_000_000 },
			}),
		);
		const stale = fakeQuery<{ n: number }>();
		ttlPrime(stale as any, "k", 1000);
		expect(stale.ready).toBe(false);
	});

	it("does nothing outside the browser", () => {
		state.browser = false;
		const server = fakeQuery<{ n: number }>();
		ttlPrime(server as any, "k", QUERY_TTL.catalog);
		expect(server.ready).toBe(false);
	});
});
