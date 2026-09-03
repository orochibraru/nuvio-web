import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache.ts";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
	vi.useRealTimers();
});

describe("TtlCache", () => {
	it("misses on an unknown key", () => {
		expect(new TtlCache<string>(1000).get("nope")).toBeUndefined();
	});

	it("returns a value inside its TTL and drops it after", () => {
		const cache = new TtlCache<string>(1000);
		cache.set("k", "v");
		vi.advanceTimersByTime(999);
		expect(cache.get("k")).toBe("v");
		vi.advanceTimersByTime(2);
		expect(cache.get("k")).toBeUndefined();
	});

	it("honours a per-entry TTL over the default", () => {
		const cache = new TtlCache<string>(10_000);
		cache.set("k", "v", 500);
		vi.advanceTimersByTime(600);
		expect(cache.get("k")).toBeUndefined();
	});

	it("wrap() produces once, then serves the cached value", async () => {
		const cache = new TtlCache<number>(1000);
		const produce = vi.fn(async () => 42);

		expect(await cache.wrap("k", produce)).toBe(42);
		expect(await cache.wrap("k", produce)).toBe(42);
		expect(produce).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1001);
		expect(await cache.wrap("k", produce)).toBe(42);
		expect(produce).toHaveBeenCalledTimes(2);
	});

	it("wrap() takes its own TTL", async () => {
		const cache = new TtlCache<number>(10_000);
		const produce = vi.fn(async () => 1);
		await cache.wrap("k", produce, 100);
		vi.advanceTimersByTime(150);
		await cache.wrap("k", produce, 100);
		expect(produce).toHaveBeenCalledTimes(2);
	});

	it("delete() drops one key, clear() drops them all", () => {
		const cache = new TtlCache<string>(1000);
		cache.set("a", "1");
		cache.set("b", "2");
		cache.delete("a");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
		cache.clear();
		expect(cache.get("b")).toBeUndefined();
	});
});
