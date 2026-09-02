import { describe, expect, it } from "vitest";
import { budgeted } from "./client-request-budget.ts";

describe("budgeted", () => {
	it("never runs more than the global budget at once", async () => {
		let active = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 20 }, () =>
				budgeted(async () => {
					active += 1;
					peak = Math.max(peak, active);
					await new Promise((r) => setTimeout(r, 5));
					active -= 1;
				}),
			),
		);
		expect(peak).toBeLessThanOrEqual(6);
	});

	it("admits queued callers in the order they called in (FIFO)", async () => {
		const order: number[] = [];
		// Fill the budget with slow calls, then queue fast ones behind them —
		// the queued calls must still run in the order they arrived.
		const blockers = Array.from({ length: 6 }, () =>
			budgeted(() => new Promise((r) => setTimeout(r, 20))),
		);
		const queued = [0, 1, 2].map((i) =>
			budgeted(async () => {
				order.push(i);
			}),
		);
		await Promise.all([...blockers, ...queued]);
		expect(order).toEqual([0, 1, 2]);
	});

	it("releases the slot even when `fn` rejects", async () => {
		await expect(
			budgeted(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		// If the failed call's slot never released, this would hang forever
		// waiting behind five other blockers plus the leaked one.
		let ran = false;
		await Promise.all([
			...Array.from({ length: 5 }, () =>
				budgeted(() => new Promise((r) => setTimeout(r, 5))),
			),
			budgeted(async () => {
				ran = true;
			}),
		]);
		expect(ran).toBe(true);
	});

	it("returns fn's resolved value", async () => {
		expect(await budgeted(async () => 42)).toBe(42);
	});
});
