import { describe, expect, it } from "vitest";
import { formatRemaining, parseRuntimeMs } from "./runtime.ts";

describe("parseRuntimeMs", () => {
	const min = (n: number) => n * 60_000;

	it("parses '49 min'", () => {
		expect(parseRuntimeMs("49 min")).toBe(min(49));
	});

	it("parses '1h 22m'", () => {
		expect(parseRuntimeMs("1h 22m")).toBe(min(82));
	});

	it("parses a bare minute count", () => {
		expect(parseRuntimeMs("142")).toBe(min(142));
	});

	it("does not read the 'm' in 'ms'", () => {
		expect(parseRuntimeMs("120ms")).toBe(min(120));
	});

	it("falls back to 45 min on junk or nothing", () => {
		expect(parseRuntimeMs(null)).toBe(min(45));
		expect(parseRuntimeMs("")).toBe(min(45));
		expect(parseRuntimeMs("unknown")).toBe(min(45));
	});
});

describe("formatRemaining", () => {
	const min = (n: number) => n * 60_000;

	it("shows minutes under an hour", () => {
		expect(formatRemaining(min(3))).toBe("3 min left");
		expect(formatRemaining(min(59))).toBe("59 min left");
	});

	it("shows hours and minutes past an hour", () => {
		expect(formatRemaining(min(60))).toBe("1 h left");
		expect(formatRemaining(min(72))).toBe("1 h 12 min left");
	});

	it("collapses the last stretch to 'Almost done'", () => {
		expect(formatRemaining(20_000)).toBe("Almost done");
		expect(formatRemaining(0)).toBe("Almost done");
	});
});
