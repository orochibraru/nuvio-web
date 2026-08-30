import { describe, expect, it } from "vitest";
import {
	type IntroDbMedia,
	normalizeSegments,
	segmentLookup,
	segmentQuery,
} from "./segments.js";

describe("segmentLookup", () => {
	it("maps a tmdb-prefixed id to tmdb_id", () => {
		expect(segmentLookup("tmdb:550")).toEqual({ tmdbId: 550 });
		expect(segmentLookup("tmdb:1396:1:1")).toEqual({ tmdbId: 1396 });
	});

	it("maps an imdb id to imdb_id", () => {
		expect(segmentLookup("tt1375666")).toEqual({ imdbId: "tt1375666" });
	});

	it("maps a bare number to tmdb_id", () => {
		expect(segmentLookup("550")).toEqual({ tmdbId: 550 });
	});

	it("returns null for an unrecognised id", () => {
		expect(segmentLookup("kitsu:42")).toBeNull();
		expect(segmentLookup("")).toBeNull();
	});
});

describe("segmentQuery", () => {
	it("builds a movie query", () => {
		expect(segmentQuery("tt1375666", null, null)?.toString()).toBe(
			"imdb_id=tt1375666",
		);
	});

	it("builds an episode query with season + episode", () => {
		const q = segmentQuery("tmdb:1396", 1, 1);
		expect(q?.get("tmdb_id")).toBe("1396");
		expect(q?.get("season")).toBe("1");
		expect(q?.get("episode")).toBe("1");
	});

	it("omits season/episode when only one is present", () => {
		expect(segmentQuery("tt1375666", 1, null)?.has("season")).toBe(false);
	});

	it("returns null for an unmappable id", () => {
		expect(segmentQuery("kitsu:42", 1, 1)).toBeNull();
	});
});

describe("normalizeSegments", () => {
	it("returns nulls for a missing response", () => {
		expect(normalizeSegments(null)).toEqual({ intro: null, credits: null });
	});

	it("converts the first intro + credits segment to seconds", () => {
		const media: IntroDbMedia = {
			intro: [{ start_ms: 30000, end_ms: 90000 }],
			credits: [{ start_ms: 2_580_000, end_ms: null }],
		};
		expect(normalizeSegments(media)).toEqual({
			intro: { start: 30, end: 90 },
			credits: { start: 2580 },
		});
	});

	it("treats a null intro start as 0", () => {
		expect(
			normalizeSegments({ intro: [{ start_ms: null, end_ms: 85200 }] }).intro,
		).toEqual({ start: 0, end: 85.2 });
	});

	it("drops a zero-length / no-segment intro marker", () => {
		expect(
			normalizeSegments({ intro: [{ start_ms: 0, end_ms: 0 }] }).intro,
		).toBeNull();
	});

	it("drops a credits marker with no start", () => {
		expect(
			normalizeSegments({ credits: [{ start_ms: 0, end_ms: null }] }).credits,
		).toBeNull();
	});
});
