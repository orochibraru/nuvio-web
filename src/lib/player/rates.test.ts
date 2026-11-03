import { describe, expect, it } from "vitest";
import { stepRate } from "./rates.ts";

describe("stepRate", () => {
	it("moves one listed speed up or down", () => {
		expect(stepRate(1, 1)).toBe(1.25);
		expect(stepRate(1, -1)).toBe(0.75);
	});

	it("holds at either end", () => {
		expect(stepRate(2, 1)).toBe(2);
		expect(stepRate(0.5, -1)).toBe(0.5);
	});

	it("snaps an unlisted speed to its neighbour", () => {
		expect(stepRate(1.1, 1)).toBe(1.25);
		expect(stepRate(1.1, -1)).toBe(1);
	});
});
