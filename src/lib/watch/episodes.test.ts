import { describe, expect, it } from "vitest";
import type { Meta } from "#lib/addons/index.js";
import {
	airDateLabel,
	episodeLabel,
	isAired,
	nextEpisode,
	nextToAir,
	upcomingEpisode,
} from "./episodes.ts";

const videos = [
	{ id: "x:1:1", title: "a", season: 1, episode: 1 },
	{ id: "x:1:2", title: "b", season: 1, episode: 2 },
	{ id: "x:2:1", title: "c", season: 2, episode: 1 },
	{ id: "x:0:1", title: "special", season: 0, episode: 1 },
] as NonNullable<Meta["videos"]>;

describe("nextEpisode", () => {
	it("returns the next episode within a season", () => {
		expect(nextEpisode(videos, 1, 1)).toEqual({ season: 1, episode: 2 });
	});

	it("rolls over to the next season", () => {
		expect(nextEpisode(videos, 1, 2)).toEqual({ season: 2, episode: 1 });
	});

	it("returns null for the last episode", () => {
		expect(nextEpisode(videos, 2, 1)).toBeNull();
	});

	it("returns null for a movie / missing coordinates / no videos", () => {
		expect(nextEpisode(videos, null, null)).toBeNull();
		expect(nextEpisode(undefined, 1, 1)).toBeNull();
	});

	it("ignores season 0 specials", () => {
		// s1e2 -> s2e1, never the special
		expect(nextEpisode(videos, 1, 2)).toEqual({ season: 2, episode: 1 });
	});
});

const NOW = Date.parse("2026-09-17T12:00:00Z");

const airing = [
	{
		id: "y:1:1",
		title: "Pilot",
		season: 1,
		episode: 1,
		released: "2026-09-01T00:00:00Z",
	},
	{
		id: "y:1:2",
		title: "Two",
		season: 1,
		episode: 2,
		released: "2026-09-10T00:00:00Z",
	},
	{
		id: "y:1:3",
		title: "Three",
		season: 1,
		episode: 3,
		released: "2026-09-24T01:00:00Z",
	},
	{
		id: "y:1:4",
		title: "Four",
		season: 1,
		episode: 4,
		released: "2026-10-01T01:00:00Z",
	},
] as NonNullable<Meta["videos"]>;

describe("isAired", () => {
	it("compares against now, and treats a missing or bad date as aired", () => {
		expect(isAired("2026-09-10T00:00:00Z", NOW)).toBe(true);
		expect(isAired("2026-09-24T00:00:00Z", NOW)).toBe(false);
		expect(isAired(undefined, NOW)).toBe(true);
		expect(isAired("not a date", NOW)).toBe(true);
	});
});

// "Up next" auto-plays this and Continue Watching rolls forward to it: an
// episode with no streams yet must never come out of it.
describe("nextEpisode and unaired episodes", () => {
	it("does not hand back an episode that has not aired", () => {
		expect(nextEpisode(airing, 1, 1, NOW)).toEqual({ season: 1, episode: 2 });
		expect(nextEpisode(airing, 1, 2, NOW)).toBeNull();
	});
});

describe("upcomingEpisode", () => {
	it("returns the next episode with its air date when it has not aired", () => {
		expect(upcomingEpisode(airing, 1, 2, NOW)).toEqual({
			season: 1,
			episode: 3,
			title: "Three",
			airsAt: "2026-09-24T01:00:00.000Z",
		});
	});

	it("is null when the next episode is out, or there is none", () => {
		expect(upcomingEpisode(airing, 1, 1, NOW)).toBeNull();
		expect(upcomingEpisode(airing, 1, 4, NOW)).toBeNull();
		expect(upcomingEpisode(airing, null, null, NOW)).toBeNull();
	});
});

describe("nextToAir", () => {
	it("finds the first unaired episode of the series", () => {
		expect(nextToAir(airing, NOW)?.episode).toBe(3);
	});

	it("is null for a series with nothing scheduled", () => {
		expect(nextToAir(videos, NOW)).toBeNull();
		expect(nextToAir(undefined, NOW)).toBeNull();
	});
});

describe("airDateLabel", () => {
	const at = (iso: string) => airDateLabel(iso, NOW, "en-US", "UTC");

	it("says today and tomorrow by calendar day, not 24-hour spans", () => {
		expect(at("2026-09-17T23:00:00Z")).toBe("Airs today");
		expect(at("2026-09-18T02:00:00Z")).toBe("Airs tomorrow");
	});

	it("names the weekday within a week, the date beyond it", () => {
		expect(at("2026-09-20T12:00:00Z")).toBe("Airs Sun, Sep 20");
		expect(at("2026-09-28T12:00:00Z")).toBe("Airs Sep 28");
	});

	it("adds the year only when it is not this one", () => {
		expect(at("2027-01-05T12:00:00Z")).toBe("Airs Jan 5, 2027");
	});

	it("reads a date already passed as today", () => {
		expect(at("2026-09-16T12:00:00Z")).toBe("Airs today");
	});
});

describe("episodeLabel", () => {
	it("adds the title when there is one", () => {
		expect(
			episodeLabel({ season: 38, episode: 1, title: "Job", airsAt: "" }),
		).toBe("S38E1 · Job");
		expect(
			episodeLabel({ season: 38, episode: 1, title: null, airsAt: "" }),
		).toBe("S38E1");
	});
});
