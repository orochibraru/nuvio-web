import { describe, expect, it } from "vitest";
import { partitionSettled, pooledMap, settleAll, settleSome } from "./pool.ts";

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

describe("partitionSettled", () => {
	it("splits fulfilled values from rejection reasons", () => {
		const { results, errors } = partitionSettled<number>([
			{ status: "fulfilled", value: 1 },
			{ status: "rejected", reason: new Error("x") },
			{ status: "fulfilled", value: 3 },
		]);
		expect(results).toEqual([1, 3]);
		expect(errors).toHaveLength(1);
	});
});

describe("settleAll", () => {
	it("returns every value when all tasks fulfil", async () => {
		expect(await settleAll([Promise.resolve(1), Promise.resolve(2)])).toEqual([
			1, 2,
		]);
	});

	it("throws an AggregateError carrying every rejection", async () => {
		const err = await settleAll([
			Promise.resolve(1),
			Promise.reject(new Error("a")),
			Promise.reject(new Error("b")),
		]).catch((e) => e as AggregateError);
		expect(err).toBeInstanceOf(AggregateError);
		expect((err as AggregateError).errors).toHaveLength(2);
	});
});

describe("settleSome", () => {
	it("tolerates partial failure and reports both sides", async () => {
		const { results, errors } = await settleSome([
			Promise.resolve("ok"),
			Promise.reject(new Error("nope")),
		]);
		expect(results).toEqual(["ok"]);
		expect(errors).toHaveLength(1);
	});
});
