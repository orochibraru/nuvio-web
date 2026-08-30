import { describe, expect, it } from "vitest";
import { parseRuntimeMs } from "./runtime.js";

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
