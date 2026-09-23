import { describe, expect, it } from "vitest";
import { failureText } from "./failure.ts";

describe("failureText", () => {
	it("words each failure code", () => {
		expect(failureText("drm")).toBe(
			"This stream is DRM-protected, so it can't be downloaded.",
		);
		expect(failureText("http:404")).toBe("The source answered 404.");
		expect(failureText(`storage:${3 * 1024 ** 3}:${1024 ** 3}`)).toBe(
			"Not enough storage: this needs 3.0 GB, 1.0 GB is free.",
		);
		expect(failureText("storage:5:0")).toBe(
			"Not enough storage: this needs 5 B, 0 B is free.",
		);
	});

	it("reads an unknown code or legacy text as Failed", () => {
		expect(failureText("failed")).toBe("Failed");
		expect(failureText("Segment 3 answered 500.")).toBe("Failed");
		expect(failureText(null)).toBe("Failed");
	});
});
