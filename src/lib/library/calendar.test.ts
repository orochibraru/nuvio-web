import { describe, expect, it } from "vitest";
import {
	type CalendarEntry,
	dayLabel,
	groupByDay,
	hasNewEpisode,
	seriesEpisodes,
} from "./calendar.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");

function video(season: number, episode: number, released?: string) {
	return {
		id: `tt1:${season}:${episode}`,
		title: `E${episode}`,
		season,
		episode,
		released,
	};
}

function entry(airsAt: string, over: Partial<CalendarEntry> = {}) {
	return {
		id: "tt1",
		name: "Show",
		poster: null,
		season: 1,
		episode: 1,
		title: null,
		airsAt,
		...over,
	};
}

describe("seriesEpisodes", () => {
	it("keeps real dated episodes from the last week onwards", () => {
		const episodes = seriesEpisodes(
			[
				video(1, 1, "2026-10-01T00:00:00Z"),
				video(1, 2, "2026-10-28T00:00:00Z"),
				video(1, 3, "2026-11-04T00:00:00Z"),
				video(1, 4),
				video(0, 1, "2026-11-03T00:00:00Z"),
			],
			null,
			NOW,
		);
		expect(episodes.map((episode) => episode.episode)).toEqual([2, 3]);
		expect(episodes[1]).toEqual({
			season: 1,
			episode: 3,
			title: "E3",
			airsAt: "2026-11-04T00:00:00.000Z",
		});
	});

	it("adds the schedule's next airing unless the meta already lists it", () => {
		const next = {
			season: 2,
			episode: 1,
			title: null,
			airsAt: "2026-11-10T01:00:00.000Z",
		};
		expect(seriesEpisodes([], next, NOW)).toEqual([next]);
		expect(
			seriesEpisodes([video(2, 1, "2026-11-10T00:00:00Z")], next, NOW),
		).toHaveLength(1);
	});

	it("drops duplicate episode numbers", () => {
		expect(
			seriesEpisodes(
				[
					video(1, 2, "2026-11-03T00:00:00Z"),
					video(1, 2, "2026-11-03T00:00:00Z"),
				],
				null,
				NOW,
			),
		).toHaveLength(1);
	});
});

describe("hasNewEpisode", () => {
	const videos = [
		video(1, 1, "2026-10-01T00:00:00Z"),
		video(1, 2, "2026-10-30T00:00:00Z"),
		video(1, 3, "2026-11-09T00:00:00Z"),
	];

	it("flags an unwatched episode out in the last week", () => {
		expect(hasNewEpisode(videos, new Set(), NOW)).toBe(true);
	});

	it("ignores a watched one, an old one and one not out yet", () => {
		expect(hasNewEpisode(videos, new Set(["tt1:1:2"]), NOW)).toBe(false);
		expect(hasNewEpisode([videos[0], videos[2]], new Set(), NOW)).toBe(false);
	});
});

describe("dayLabel", () => {
	const label = (key: string) => dayLabel(key, NOW, "en-US", "UTC");

	it("names today, tomorrow and yesterday", () => {
		expect(label("2026-11-02")).toBe("Today");
		expect(label("2026-11-03")).toBe("Tomorrow");
		expect(label("2026-11-01")).toBe("Yesterday");
	});

	it("spells out the weekday and date, with the year only when not this one", () => {
		expect(label("2026-11-05")).toBe("Thursday, November 5");
		expect(label("2027-01-04")).toBe("Monday, January 4, 2027");
	});

	it("formats in the viewer's locale", () => {
		expect(dayLabel("2026-11-05", NOW, "fr-FR", "UTC")).toBe(
			"jeudi 5 novembre",
		);
	});
});

describe("groupByDay", () => {
	it("splits upcoming (oldest first) from the past week (newest first)", () => {
		const grouped = groupByDay(
			[
				entry("2026-11-05T20:00:00Z", { episode: 4 }),
				entry("2026-10-30T20:00:00Z", { episode: 1 }),
				entry("2026-11-02T01:00:00Z", { episode: 2 }),
				entry("2026-11-01T20:00:00Z", { episode: 3 }),
			],
			NOW,
			"en-US",
			"UTC",
		);
		expect(grouped.upcoming.map((day) => day.key)).toEqual([
			"2026-11-02",
			"2026-11-05",
		]);
		expect(grouped.recent.map((day) => day.label)).toEqual([
			"Yesterday",
			"Friday, October 30",
		]);
	});

	it("groups by calendar day in the viewer's time zone", () => {
		const late = entry("2026-11-03T02:00:00Z");
		expect(groupByDay([late], NOW, "en-US", "UTC").upcoming[0].label).toBe(
			"Tomorrow",
		);
		expect(
			groupByDay([late], NOW, "en-US", "America/New_York").upcoming[0].label,
		).toBe("Today");
	});

	it("orders one day's entries by time, then name", () => {
		const [today] = groupByDay(
			[
				entry("2026-11-02T22:00:00Z", { name: "Late" }),
				entry("2026-11-02T18:00:00Z", { name: "Zed" }),
				entry("2026-11-02T18:00:00Z", { name: "Alpha" }),
			],
			NOW,
			"en-US",
			"UTC",
		).upcoming;
		expect(today.entries.map((item) => item.name)).toEqual([
			"Alpha",
			"Zed",
			"Late",
		]);
	});
});
