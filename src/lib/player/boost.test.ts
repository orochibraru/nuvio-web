import { describe, expect, it } from "vitest";
import { needsCorsReload } from "./boost.ts";

const ORIGIN = "https://nuvio.example";

describe("needsCorsReload", () => {
	it("a cross-origin direct file loaded without CORS taints Web Audio", () => {
		expect(
			needsCorsReload("https://cdn.debrid.example/f.mkv", null, ORIGIN),
		).toBe(true);
	});

	it("already CORS-loaded, same-origin, MSE and data sources are clean", () => {
		expect(
			needsCorsReload("https://cdn.debrid.example/f.mkv", "anonymous", ORIGIN),
		).toBe(false);
		expect(needsCorsReload(`${ORIGIN}/e2e/sample.webm`, null, ORIGIN)).toBe(
			false,
		);
		expect(needsCorsReload("/e2e/sample.webm", null, ORIGIN)).toBe(false);
		expect(needsCorsReload(`blob:${ORIGIN}/0b6c-4e1f`, null, ORIGIN)).toBe(
			false,
		);
		expect(needsCorsReload("data:video/webm;base64,AAAA", null, ORIGIN)).toBe(
			false,
		);
	});

	it("nothing loaded yet : nothing to reload", () => {
		expect(needsCorsReload("", null, ORIGIN)).toBe(false);
	});
});
