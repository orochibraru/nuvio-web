import { describe, expect, it } from "vitest";
import { eachUntilFailure } from "./fan-out.ts";

describe("eachUntilFailure", () => {
	it("runs every item when nothing fails", async () => {
		const seen: number[] = [];
		await eachUntilFailure(
			[1, 2, 3, 4],
			2,
			new AbortController().signal,
			async (item) => {
				seen.push(item);
			},
		);
		expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
	});

	it("starts nothing new after a failure and settles the in-flight work first", async () => {
		const started: number[] = [];
		let inFlightSettled = false;
		const run = eachUntilFailure(
			[1, 2, 3, 4, 5, 6],
			2,
			new AbortController().signal,
			async (item, signal) => {
				started.push(item);
				if (item === 1) {
					throw new Error("segment 1 answered 500");
				}
				await new Promise((resolve) =>
					signal.addEventListener("abort", resolve),
				);
				await new Promise((resolve) => setTimeout(resolve, 10));
				inFlightSettled = true;
				throw new Error("aborted");
			},
		);
		await expect(run).rejects.toThrow("segment 1 answered 500");
		expect(inFlightSettled).toBe(true);
		expect(started).toEqual([1, 2]);
	});

	it("passes the caller's abort through to running work", async () => {
		const outer = new AbortController();
		const run = eachUntilFailure(
			[1],
			1,
			outer.signal,
			(_item, signal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("stopped")));
				}),
		);
		outer.abort();
		await expect(run).rejects.toThrow("stopped");
	});
});
