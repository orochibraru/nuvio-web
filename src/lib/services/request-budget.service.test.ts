import { describe, expect, it } from "vitest";
import { RequestBudget } from "./request-budget.service.ts";

describe("RequestBudget", () => {
	it("never runs more than the budget at once", async () => {
		const budget = new RequestBudget(6);
		let active = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 20 }, () =>
				budget.run(async () => {
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
		const budget = new RequestBudget(6);
		const order: number[] = [];
		// Fill the budget with slow calls, then queue fast ones behind them —
		// the queued calls must still run in the order they arrived.
		const blockers = Array.from({ length: 6 }, () =>
			budget.run(() => new Promise((r) => setTimeout(r, 20))),
		);
		const queued = [0, 1, 2].map((i) =>
			budget.run(async () => {
				order.push(i);
			}),
		);
		await Promise.all([...blockers, ...queued]);
		expect(order).toEqual([0, 1, 2]);
	});

	it("releases the slot even when `fn` rejects", async () => {
		const budget = new RequestBudget(6);
		await expect(
			budget.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		// If the failed call's slot never released, this would hang forever
		// waiting behind five other blockers plus the leaked one.
		let ran = false;
		await Promise.all([
			...Array.from({ length: 5 }, () =>
				budget.run(() => new Promise((r) => setTimeout(r, 5))),
			),
			budget.run(async () => {
				ran = true;
			}),
		]);
		expect(ran).toBe(true);
	});

	it("returns fn's resolved value", async () => {
		expect(await new RequestBudget(6).run(async () => 42)).toBe(42);
	});

	it("reports what is in flight and what is waiting", async () => {
		const budget = new RequestBudget(1);
		let release!: () => void;
		const blocker = budget.run(
			() =>
				new Promise<void>((r) => {
					release = r;
				}),
		);
		const queued = budget.run(async () => undefined);
		await Promise.resolve();
		expect(budget.active).toBe(1);
		expect(budget.waiting).toBe(1);
		release();
		await Promise.all([blocker, queued]);
		expect(budget.active).toBe(0);
		expect(budget.waiting).toBe(0);
	});

	// Each instance owns its own slots : the old module-level budget made this
	// impossible to test without leaking state between cases.
	it("keeps separate instances independent", async () => {
		const a = new RequestBudget(1);
		const b = new RequestBudget(1);
		let bRan = false;
		let release!: () => void;
		const blocked = a.run(
			() =>
				new Promise<void>((r) => {
					release = r;
				}),
		);
		await b.run(async () => {
			bRan = true;
		});
		expect(bRan).toBe(true);
		release();
		await blocked;
	});
});
