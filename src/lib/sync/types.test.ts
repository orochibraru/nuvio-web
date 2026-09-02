import { describe, expect, it } from "vitest";
import {
	contentType,
	historyKey,
	libraryKey,
	progressKeyFor,
} from "./types.ts";

describe("contentType", () => {
	it("normalizes 'series' and treats anything else as a movie", () => {
		expect(contentType("series")).toBe("series");
		expect(contentType("movie")).toBe("movie");
		expect(contentType("channel")).toBe("movie");
	});
});

describe("libraryKey", () => {
	it("namespaces by content type so the same id can appear twice", () => {
		expect(libraryKey("movie", "tt1")).toBe("movie:tt1");
		expect(libraryKey("series", "tt1")).toBe("series:tt1");
		expect(libraryKey("movie", "tt1")).not.toBe(libraryKey("series", "tt1"));
	});
});

describe("historyKey", () => {
	it("includes season/episode when present", () => {
		expect(historyKey("tt5", 2, 3)).toBe("tt5:2:3");
	});

	it("collapses null season/episode to empty segments", () => {
		expect(historyKey("tt5", null, null)).toBe("tt5::");
	});
});

describe("progressKeyFor", () => {
	it("namespaces an episode row by season and episode", () => {
		expect(progressKeyFor("tt9", 1, 2)).toBe("tt9_s1e2");
	});

	it("falls back to the bare content id for a movie (no season/episode)", () => {
		expect(progressKeyFor("tt9", null, null)).toBe("tt9");
	});

	it("falls back to the bare content id when only one of season/episode is set", () => {
		expect(progressKeyFor("tt9", 1, null)).toBe("tt9");
		expect(progressKeyFor("tt9", null, 2)).toBe("tt9");
	});
});
