import { describe, expect, it } from "vitest";
import pkg from "../../../package.json" with { type: "json" };
import { getVersion } from "./version.ts";

describe("getVersion", () => {
	it("is package.json's version", () => {
		expect(getVersion()).toBe(pkg.version);
		expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
	});
});
