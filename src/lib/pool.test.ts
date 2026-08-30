import { describe, expect, it } from "vitest";
import { pooledMap } from "./pool.js";

describe("pooledMap", () => {
	it("keeps input order regardless of completion order", async () => {
		const out = await pooledMap([50, 10, 30, 0], 2, async (ms, i) => {
			await new Promise((r) => setTimeout(r, ms));
			return i;
		});
		expect(out).toEqual([0, 1, 2, 3]);
	});

	it("never runs more than `limit` at once", async () => {
		let active = 0;
		let peak = 0;
		await pooledMap(Array.from({ length: 12 }), 3, async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 5));
			active -= 1;
			return null;
		});
		expect(peak).toBeLessThanOrEqual(3);
	});

	it("handles an empty list and a limit larger than the list", async () => {
		expect(await pooledMap([], 4, async () => 1)).toEqual([]);
		expect(await pooledMap([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
	});

	it("propagates a rejection from fn", async () => {
		await expect(
			pooledMap([1, 2, 3], 2, async (n) => {
				if (n === 2) {
					throw new Error("boom");
				}
				return n;
			}),
		).rejects.toThrow("boom");
	});
});
