import { describe, expect, it } from "vitest";
import { resumeName } from "./continue-watching.ts";

describe("resumeName", () => {
	it("takes the first candidate that is a real name", () => {
		expect(resumeName("tt1", "The Simpsons", "Simpsons")).toBe("The Simpsons");
	});

	it("skips a candidate that is only the content id", () => {
		expect(resumeName("tt1", "tt1", null, "The Simpsons")).toBe("The Simpsons");
	});

	it("falls back to the content id when nothing names it", () => {
		expect(resumeName("tt1", undefined, "", "tt1")).toBe("tt1");
	});
});
