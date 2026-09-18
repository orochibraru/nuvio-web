import { describe, expect, it } from "vitest";
import {
	animeLookup,
	aniSkipUrl,
	type IntroDbMedia,
	normalizeAniSkip,
	normalizeSegments,
	pickMalId,
	segmentLookup,
	segmentQuery,
} from "./segments.ts";

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
			intro: [{ start_ms: 30_000, end_ms: 90_000 }],
			credits: [{ start_ms: 2_580_000, end_ms: null }],
		};
		expect(normalizeSegments(media)).toEqual({
			intro: { start: 30, end: 90 },
			credits: { start: 2580 },
		});
	});

	it("treats a null intro start as 0", () => {
		expect(
			normalizeSegments({ intro: [{ start_ms: null, end_ms: 85_200 }] }).intro,
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

describe("animeLookup", () => {
	it("uses a MAL id directly", () => {
		expect(animeLookup("mal:52991")).toEqual({ kind: "mal", malId: 52_991 });
	});

	it("maps Kitsu and AniList ids one-to-one", () => {
		expect(animeLookup("kitsu:46474")).toEqual({
			kind: "ids",
			path: "ids?source=kitsu&id=46474",
		});
		expect(animeLookup("anilist:154587")).toEqual({
			kind: "ids",
			path: "ids?source=anilist&id=154587",
		});
	});

	it("maps IMDb and TMDB ids through ARM's per-season lists", () => {
		expect(animeLookup("tt22248376")).toEqual({
			kind: "list",
			path: "imdb?id=tt22248376",
		});
		expect(animeLookup("tmdb:209867")).toEqual({
			kind: "list",
			path: "themoviedb?id=209867",
		});
		expect(animeLookup("209867")).toEqual({
			kind: "list",
			path: "themoviedb?id=209867",
		});
	});

	it("gives up on anything else", () => {
		expect(animeLookup("local:abc")).toBeNull();
		expect(animeLookup("")).toBeNull();
	});
});

describe("pickMalId", () => {
	const seasons = [
		{ myanimelist: 52_991, "themoviedb-season": 1 },
		{ myanimelist: 59_978, "themoviedb-season": 2 },
	];

	it("picks the entry for the season asked for", () => {
		expect(pickMalId(seasons, 2)).toBe(59_978);
	});

	it("matches a TVDB season when TMDB's is missing", () => {
		expect(pickMalId([{ myanimelist: 5, "thetvdb-season": 3 }], 3)).toBe(5);
	});

	it("takes a lone entry whatever the season", () => {
		expect(pickMalId({ myanimelist: 7 }, null)).toBe(7);
		expect(pickMalId([{ myanimelist: 7 }], 4)).toBe(7);
	});

	// Skip times for the wrong season are worse than none.
	it("refuses to guess between several seasons", () => {
		expect(pickMalId(seasons, 5)).toBeNull();
		expect(pickMalId(seasons, null)).toBeNull();
	});

	it("handles no mapping at all", () => {
		expect(pickMalId([], 1)).toBeNull();
		expect(pickMalId(null, 1)).toBeNull();
		expect(pickMalId({ myanimelist: null }, 1)).toBeNull();
	});
});

describe("aniSkipUrl", () => {
	it("asks for openings and endings, mixed ones included", () => {
		const url = new URL(aniSkipUrl(52_991, 5));
		expect(url.pathname).toBe("/v2/skip-times/52991/5");
		expect(url.searchParams.getAll("types[]")).toEqual([
			"op",
			"ed",
			"mixed-op",
			"mixed-ed",
		]);
		expect(url.searchParams.get("episodeLength")).toBe("0");
	});

	it("treats a movie as episode 1", () => {
		expect(aniSkipUrl(1, null)).toContain("/skip-times/1/1?");
	});
});

describe("normalizeAniSkip", () => {
	it("maps an opening to the intro and an ending to the credits", () => {
		expect(
			normalizeAniSkip({
				found: true,
				results: [
					{ skipType: "ed", interval: { startTime: 1400, endTime: 1490 } },
					{ skipType: "op", interval: { startTime: 3, endTime: 93 } },
				],
			}),
		).toEqual({ intro: { start: 3, end: 93 }, credits: { start: 1400 } });
	});

	it("falls back to mixed segments", () => {
		expect(
			normalizeAniSkip({
				found: true,
				results: [
					{ skipType: "mixed-op", interval: { startTime: 0, endTime: 80 } },
				],
			}).intro,
		).toEqual({ start: 0, end: 80 });
	});

	it("ignores a too-short opening and a missing response", () => {
		expect(
			normalizeAniSkip({
				found: true,
				results: [{ skipType: "op", interval: { startTime: 10, endTime: 11 } }],
			}),
		).toEqual({ intro: null, credits: null });
		expect(normalizeAniSkip(null)).toEqual({ intro: null, credits: null });
		expect(normalizeAniSkip({ found: false })).toEqual({
			intro: null,
			credits: null,
		});
	});
});
