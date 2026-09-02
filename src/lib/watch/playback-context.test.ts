import { describe, expect, it } from "vitest";
import type { Meta, MetaVideo } from "#lib/addons/index.js";
import {
	assemblePlaybackContext,
	heroFields,
	nextCard,
	overlayInfo,
	parseVideoId,
	playOrder,
	progressKey,
	resumePoint,
} from "./playback-context.ts";

function video(over: Partial<MetaVideo>): MetaVideo {
	return { id: "v", title: "Episode", ...over };
}

// The app addresses series with a colon-free content id (IMDB `tt…`) plus
// `:season:episode`, e.g. `tt0411008:1:2` : `parseVideoId` splits on `:`.
const seriesMeta: Meta = {
	id: "tt0411008",
	type: "series",
	name: "Lost",
	poster: "p.jpg",
	background: "bg.jpg",
	genres: ["Mystery", "Drama"],
	imdbRating: 8.3,
	videos: [
		video({
			id: "tt0411008:1:2",
			season: 1,
			episode: 2,
			title: "Pilot, Part 2",
		}),
		video({
			id: "tt0411008:1:1",
			season: 1,
			episode: 1,
			title: "Pilot, Part 1",
		}),
		video({ id: "tt0411008:0:1", season: 0, episode: 1, title: "Special" }),
		video({
			id: "tt0411008:2:1",
			season: 2,
			episode: 1,
			title: "Man of Science",
		}),
	],
};

describe("parseVideoId", () => {
	it("returns just the id for a movie", () => {
		expect(parseVideoId("movie", "tt0137523")).toEqual({
			contentId: "tt0137523",
			season: undefined,
			episode: undefined,
		});
	});

	it("splits a series episode id", () => {
		expect(parseVideoId("series", "tt0411008:2:5")).toEqual({
			contentId: "tt0411008",
			season: 2,
			episode: 5,
		});
	});

	it("tolerates a series id with no episode part", () => {
		expect(parseVideoId("series", "tt0411008")).toEqual({
			contentId: "tt0411008",
			season: undefined,
			episode: undefined,
		});
	});
});

describe("progressKey", () => {
	it("is the bare content id for a movie", () => {
		expect(progressKey("tt0137523")).toBe("tt0137523");
	});

	it("appends season/episode for an episode", () => {
		expect(progressKey("tt0411008", 2, 5)).toBe("tt0411008_s2e5");
	});
});

describe("playOrder", () => {
	it("drops season 0 and sorts by season then episode", () => {
		expect(playOrder(seriesMeta.videos).map((entry) => entry.id)).toEqual([
			"tt0411008:1:1",
			"tt0411008:1:2",
			"tt0411008:2:1",
		]);
	});

	it("is empty when there are no videos", () => {
		expect(playOrder(undefined)).toEqual([]);
	});
});

describe("nextCard", () => {
	it("points at the following episode in play order", () => {
		const ordered = playOrder(seriesMeta.videos);
		expect(nextCard(ordered, 1, 1)).toEqual({
			videoId: "tt0411008:1:2",
			label: "S1E2 · Pilot, Part 2",
			thumbnail: null,
		});
	});

	it("is null on the last episode", () => {
		const ordered = playOrder(seriesMeta.videos);
		expect(nextCard(ordered, 2, 1)).toBeNull();
	});
});

describe("heroFields", () => {
	it("defaults every field when meta is missing", () => {
		expect(heroFields(undefined)).toEqual({
			background: null,
			poster: null,
			logo: null,
			certification: null,
			genres: [],
		});
	});

	it("derives an 18+ certification from the adult behavior hint", () => {
		expect(
			heroFields({ ...seriesMeta, behaviorHints: { adult: true } })
				.certification,
		).toBe("18+");
	});
});

describe("overlayInfo", () => {
	it("caps cast/crew and formats a numeric rating", () => {
		const info = overlayInfo(
			{
				...seriesMeta,
				imdbRating: 8,
				cast: Array.from({ length: 12 }, (_, i) => `Actor ${i}`),
				director: ["A", "B", "C", "D"],
			},
			{ title: "Pilot", overview: "the one where" },
		);
		expect(info.imdbRating).toBe("8.0");
		expect(info.cast).toHaveLength(8);
		expect(info.director).toHaveLength(3);
		expect(info.episodeTitle).toBe("Pilot");
	});
});

describe("resumePoint", () => {
	it("returns the marker once there's real progress into a known duration", () => {
		expect(resumePoint({ duration: 3_000_000, position: 90_000 })).toEqual({
			position: 90_000,
			duration: 3_000_000,
		});
	});

	it("is null below the 5s floor or with no duration", () => {
		expect(resumePoint({ duration: 3_000_000, position: 2000 })).toBeNull();
		expect(resumePoint({ duration: 0, position: 90_000 })).toBeNull();
		expect(resumePoint(null)).toBeNull();
	});
});

describe("assemblePlaybackContext", () => {
	it("assembles a movie payload with a resume marker", () => {
		const ctx = assemblePlaybackContext({
			type: "movie",
			id: "tt0137523",
			meta: {
				id: "tt0137523",
				type: "movie",
				name: "Fight Club",
				poster: "fc.jpg",
				runtime: "139 min",
			},
			progressRows: [
				{ progress_key: "tt0137523", duration: 8_340_000, position: 4_000_000 },
				{ progress_key: "other", duration: 100, position: 50 },
			],
		});
		expect(ctx.metaType).toBe("movie");
		expect(ctx.heading).toBe("Fight Club");
		expect(ctx.subheading).toBeNull();
		expect(ctx.episodes).toEqual([]);
		expect(ctx.next).toBeNull();
		expect(ctx.resume).toEqual({ position: 4_000_000, duration: 8_340_000 });
		expect(ctx.info.runtime).toBe("139 min");
	});

	it("assembles an episode payload with subheading, episode list and next", () => {
		const ctx = assemblePlaybackContext({
			type: "series",
			id: "tt0411008:1:1",
			meta: seriesMeta,
			progressRows: [
				{
					progress_key: "tt0411008_s1e1",
					duration: 2_800_000,
					position: 1_400_000,
				},
			],
		});
		expect(ctx.metaType).toBe("series");
		expect(ctx.season).toBe(1);
		expect(ctx.episode).toBe(1);
		expect(ctx.subheading).toBe("S1E1 · Pilot, Part 1");
		expect(ctx.episodes.map((e) => e.videoId)).toEqual([
			"tt0411008:1:1",
			"tt0411008:1:2",
			"tt0411008:2:1",
		]);
		expect(ctx.next?.videoId).toBe("tt0411008:1:2");
		expect(ctx.resume).toEqual({ position: 1_400_000, duration: 2_800_000 });
	});

	it("degrades to the content id and empty fields when meta is missing", () => {
		const ctx = assemblePlaybackContext({
			type: "movie",
			id: "tt0999999",
			meta: undefined,
			progressRows: [],
		});
		expect(ctx.heading).toBe("tt0999999");
		expect(ctx.background).toBeNull();
		expect(ctx.genres).toEqual([]);
		expect(ctx.resume).toBeNull();
	});
});
