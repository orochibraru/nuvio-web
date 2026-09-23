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
	resumeRowFor,
	resumeTarget,
	titleProgressFor,
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
	it("keeps a namespace prefix as part of the content id", () => {
		expect(parseVideoId("series", "tmdb:1396:2:5")).toEqual({
			contentId: "tmdb:1396",
			season: 2,
			episode: 5,
		});
	});

	// Kitsu episodes are absolute and the addon lists them as season 1.
	it("reads a namespaced id with one trailing number as season 1", () => {
		expect(parseVideoId("series", "kitsu:46474:5")).toEqual({
			contentId: "kitsu:46474",
			season: 1,
			episode: 5,
		});
	});

	it("leaves a bare namespaced series id without an episode", () => {
		expect(parseVideoId("series", "tmdb:1396")).toEqual({
			contentId: "tmdb:1396",
			season: undefined,
			episode: undefined,
		});
	});

	it("returns a namespaced movie id whole", () => {
		expect(parseVideoId("movie", "tmdb:550").contentId).toBe("tmdb:550");
	});

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

	it("is null for a finished one, which plays from the start", () => {
		expect(
			resumePoint({ duration: 1_320_000, position: 1_320_000 }),
		).toBeNull();
		expect(
			resumePoint({ duration: 1_320_000, position: 1_200_000 }),
		).toBeNull();
	});
});

describe("assemblePlaybackContext", () => {
	it("assembles a movie payload", () => {
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
		});
		expect(ctx.metaType).toBe("movie");
		expect(ctx.heading).toBe("Fight Club");
		expect(ctx.subheading).toBeNull();
		expect(ctx.episodes).toEqual([]);
		expect(ctx.next).toBeNull();
		expect(ctx.info.runtime).toBe("139 min");
	});

	it("assembles an episode payload with subheading, episode list and next", () => {
		const ctx = assemblePlaybackContext({
			type: "series",
			id: "tt0411008:1:1",
			meta: seriesMeta,
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
	});

	it("degrades to the content id and empty fields when meta is missing", () => {
		const ctx = assemblePlaybackContext({
			type: "movie",
			id: "tt0999999",
			meta: undefined,
		});
		expect(ctx.heading).toBe("tt0999999");
		expect(ctx.background).toBeNull();
		expect(ctx.genres).toEqual([]);
	});
});

describe("nextCard and unaired episodes", () => {
	const ordered = [
		{
			id: "z:1:1",
			title: "One",
			season: 1,
			episode: 1,
			released: "2020-01-01",
		},
		{
			id: "z:1:2",
			title: "Two",
			season: 1,
			episode: 2,
			released: "2099-01-01",
		},
	] as MetaVideo[];

	// The card auto-plays after a countdown: never into an episode with no streams.
	it("offers no card for an episode that has not aired", () => {
		expect(nextCard(ordered, 1, 1)).toBeNull();
	});

	it("offers the card once it has", () => {
		expect(nextCard(ordered, 1, 1, Date.parse("2099-06-01"))?.videoId).toBe(
			"z:1:2",
		);
	});
});

describe("titleProgressFor", () => {
	const row = (over: {
		contentId: string;
		videoId: string;
		season?: number | null;
		episode?: number | null;
		position?: number;
		duration?: number;
	}) => ({
		season: null,
		episode: null,
		position: 100_000,
		duration: 100_000,
		...over,
	});
	const videos = [
		video({ id: "tmdb:1396:1:1", season: 1, episode: 1 }),
		video({ id: "tmdb:1396:1:2", season: 1, episode: 2 }),
	];

	it("matches player rows keyed by the namespaced episode id under a tt URL", () => {
		const map = titleProgressFor(
			[
				row({
					contentId: "tmdb:1396",
					videoId: "tmdb:1396:1:1",
					season: 1,
					episode: 1,
				}),
				row({
					contentId: "tmdb:1396",
					videoId: "tmdb:1396:1:2",
					season: 1,
					episode: 2,
					position: 40_000,
				}),
			],
			"series",
			"tt0903747",
			videos,
		);
		expect(map["tmdb:1396:1:1"]).toEqual({ fraction: 1, completed: true });
		expect(map["tmdb:1396:1:2"]).toEqual({ fraction: 0.4, completed: false });
		expect(resumeTarget(playOrder(videos), map)?.label).toBe("Resume S1E2");
	});

	it("matches rows keyed by the URL id with a differently spelled video id", () => {
		const map = titleProgressFor(
			[
				row({
					contentId: "tt0903747",
					videoId: "tt0903747:1:1",
					season: 1,
					episode: 1,
				}),
			],
			"series",
			"tt0903747",
			videos,
		);
		expect(map["tmdb:1396:1:1"].completed).toBe(true);
	});

	it("lines kitsu absolute ids up with season 1", () => {
		const map = titleProgressFor(
			[row({ contentId: "kitsu:1", videoId: "kitsu:1:2", position: 40_000 })],
			"series",
			"kitsu:1",
			[video({ id: "kitsu:1:2", season: 1, episode: 2 })],
		);
		expect(map["kitsu:1:2"].fraction).toBe(0.4);
	});

	it("ignores other titles and keeps the furthest of two rows for one episode", () => {
		const map = titleProgressFor(
			[
				row({ contentId: "tt1", videoId: "tt1:1:1" }),
				row({
					contentId: "tt0903747",
					videoId: "tmdb:1396:1:2",
					position: 10_000,
				}),
				row({
					contentId: "tmdb:1396",
					videoId: "tmdb:1396:1:2",
					position: 50_000,
				}),
			],
			"series",
			"tt0903747",
			videos,
		);
		expect(map["tmdb:1396:1:1"]).toBeUndefined();
		expect(map["tmdb:1396:1:2"].fraction).toBe(0.5);
	});

	it("never marks a short clip completed, even past 90%", () => {
		const map = titleProgressFor(
			[row({ contentId: "tt9", videoId: "tt9", duration: 59_000 })],
			"movie",
			"tt9",
			undefined,
		);
		expect(map.tt9.completed).toBe(false);
	});

	it("keys a movie by the URL id", () => {
		const map = titleProgressFor(
			[row({ contentId: "tt9", videoId: "tt9" })],
			"movie",
			"tt9",
			undefined,
		);
		expect(map.tt9.completed).toBe(true);
	});
});

describe("resumeRowFor", () => {
	const row = (over: {
		contentId: string;
		videoId: string;
		season?: number | null;
		episode?: number | null;
		position?: number;
	}) => ({
		season: 1,
		episode: 2,
		position: 600_000,
		duration: 2_400_000,
		...over,
	});

	it("resumes an episode marked under the tt URL id from a tmdb episode id", () => {
		const marked = row({ contentId: "tt0903747", videoId: "tmdb:1396:1:2" });
		expect(resumeRowFor([marked], "series", "tmdb:1396:1:2")).toBe(marked);
	});

	it("resumes an episode marked under a tmdb URL id from a tt episode id", () => {
		const marked = row({ contentId: "tmdb:1396", videoId: "tt0903747:1:2" });
		expect(resumeRowFor([marked], "series", "tt0903747:1:2")).toBe(marked);
	});

	it("prefers the exact progress key over a further alias row", () => {
		const exact = row({ contentId: "tmdb:1396", videoId: "tmdb:1396:1:2" });
		const alias = row({
			contentId: "tt0903747",
			videoId: "tmdb:1396:1:2",
			position: 2_000_000,
		});
		expect(resumeRowFor([alias, exact], "series", "tmdb:1396:1:2")).toBe(exact);
	});

	it("takes the furthest alias row and skips other episodes and titles", () => {
		const near = row({ contentId: "tt0903747", videoId: "tmdb:1396:1:2" });
		const far = row({
			contentId: "tt0903747",
			videoId: "tmdb:1396:1:2",
			position: 1_200_000,
		});
		const rows = [
			near,
			far,
			row({ contentId: "tmdb:1396", videoId: "tmdb:1396:1:3", episode: 3 }),
			row({ contentId: "tt1", videoId: "tt1:1:2" }),
		];
		expect(resumeRowFor(rows, "series", "tmdb:1396:1:2")).toBe(far);
		expect(resumeRowFor(rows, "series", "tmdb:1396:1:9")).toBeNull();
	});

	it("matches a movie by its id", () => {
		const film = row({
			contentId: "tt9",
			videoId: "tt9",
			season: null,
			episode: null,
		});
		expect(resumeRowFor([film], "movie", "tt9")).toBe(film);
		expect(resumeRowFor([film], "movie", "tt8")).toBeNull();
	});
});

describe("resumeTarget", () => {
	const eps = playOrder([
		video({ id: "e1", season: 1, episode: 1 }),
		video({ id: "e2", season: 1, episode: 2 }),
	]);
	const done = { fraction: 1, completed: true };

	it("resumes the episode in progress", () => {
		expect(
			resumeTarget(eps, { e1: done, e2: { fraction: 0.4, completed: false } }),
		).toEqual({ id: "e2", label: "Resume S1E2" });
	});

	it("continues after the last finished episode", () => {
		expect(resumeTarget(eps, { e1: done })).toEqual({
			id: "e2",
			label: "Continue S1E2",
		});
	});

	it("is null with no progress", () => {
		expect(resumeTarget(eps, {})).toBeNull();
	});

	it("never says Continue S1E1 because of a special, an unnumbered or a duplicate video", () => {
		const ordered = playOrder([
			video({ id: "s0", season: 0, episode: 1 }),
			video({ id: "nonum", season: 1 }),
			video({ id: "dup", season: 1, episode: 1 }),
			video({ id: "e1", season: 1, episode: 1 }),
			video({ id: "e2", season: 1, episode: 2 }),
		]);
		expect(ordered.map((entry) => entry.id)).toEqual(["dup", "e2"]);
		expect(resumeTarget(ordered, { s0: done, nonum: done })).toBeNull();
		// A row saved against the dropped duplicate still counts for the kept one.
		const map = titleProgressFor(
			[
				{
					contentId: "tt1",
					videoId: "e1",
					season: 1,
					episode: 1,
					position: 1,
					duration: 1e5,
				},
			],
			"series",
			"tt1",
			[
				video({ id: "dup", season: 1, episode: 1 }),
				video({ id: "e1", season: 1, episode: 1 }),
			],
		);
		expect(Object.keys(map).sort()).toEqual(["dup", "e1"]);
	});
});
