import { describe, expect, it, vi } from "vitest";
import type { Meta } from "#lib/addons/index.js";
import { progressRecordFromRow } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import {
	pullContinueWatching,
	pullNextToAir,
	pullPlaybackMeta,
	pullPlaybackResume,
	pullProgressRows,
	pullUpcoming,
} from "./watch-data.ts";

/** Snake-case API rows, stored as the local store keeps them. */
function nuvioWith(rows: unknown[] | Promise<never>): ProfileData {
	const none = async () => [];
	return {
		library: none,
		history: none,
		progress: () =>
			rows instanceof Promise
				? rows
				: Promise.resolve(
						rows.map((entry) => progressRecordFromRow(entry as never)),
					),
	};
}

const row = (over: Record<string, unknown>) => ({
	content_id: "tt1",
	content_type: "movie",
	video_id: "tt1",
	season: null,
	episode: null,
	position: 30_000,
	duration: 120_000,
	last_watched: 100,
	...over,
});

describe("pullContinueWatching", () => {
	const lookup = (byId: Record<string, unknown> = {}) =>
		vi.fn(async (_type: string, id: string) => (byId[id] ?? null) as never);

	it("drops rows shorter than a minute and finished movies", async () => {
		const nuvio = nuvioWith([
			row({ content_id: "short", duration: 30_000 }),
			row({ content_id: "done", position: 595_000, duration: 600_000 }),
		]);
		expect(await pullContinueWatching(nuvio, lookup())).toEqual([]);
	});

	it("keeps a mid-movie row with progress + remaining time", async () => {
		const nuvio = nuvioWith([row({ position: 300_000, duration: 600_000 })]);
		const [item] = await pullContinueWatching(
			nuvio,
			lookup({ tt1: { name: "Movie One", poster: "p.jpg" } }),
		);
		expect(item).toMatchObject({
			id: "tt1",
			name: "Movie One",
			videoId: "tt1",
			progress: 0.5,
			remainingMs: 300_000,
		});
	});

	it("rolls a finished series episode forward to the next one", async () => {
		const nuvio = nuvioWith([
			row({
				content_id: "s1",
				content_type: "series",
				video_id: "s1:1:1",
				season: 1,
				episode: 1,
				position: 590_000,
				duration: 600_000,
			}),
		]);
		const [item] = await pullContinueWatching(
			nuvio,
			lookup({
				s1: {
					name: "Show",
					videos: [
						{ season: 1, episode: 1 },
						{ season: 1, episode: 2 },
					],
				},
			}),
		);
		expect(item).toMatchObject({
			videoId: "s1:1:2",
			season: 1,
			episode: 2,
			progress: 0,
		});
	});

	it("falls back to the content id when no addon knows the title", async () => {
		const nuvio = nuvioWith([row({})]);
		const [item] = await pullContinueWatching(nuvio, lookup());
		expect(item.name).toBe("tt1");
	});

	it("keeps only the most-recent row per title", async () => {
		const nuvio = nuvioWith([
			row({ last_watched: 10, position: 60_000, duration: 600_000 }),
			row({ last_watched: 20, position: 120_000, duration: 600_000 }),
		]);
		const items = await pullContinueWatching(
			nuvio,
			lookup({ tt1: { name: "M" } }),
		);
		expect(items).toHaveLength(1);
		expect(items[0].progress).toBeCloseTo(0.2);
	});

	it("survives a watch-progress pull failure", async () => {
		const nuvio = nuvioWith(Promise.reject(new Error("500")) as never);
		expect(await pullContinueWatching(nuvio, lookup())).toEqual([]);
	});

	it("never has more than a handful of meta lookups in flight at once", async () => {
		// An unbounded burst is what times some out and leaves those cards
		// showing a bare content id for a name.
		const nuvio = nuvioWith(
			Array.from({ length: 10 }, (_, i) => row({ content_id: `tt${i}` })),
		);
		let active = 0;
		let peak = 0;
		const slowLookup = vi.fn(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 5));
			active -= 1;
			return { name: "M" } as never;
		});

		await pullContinueWatching(nuvio, slowLookup);
		expect(peak).toBeLessThanOrEqual(4);
		expect(slowLookup).toHaveBeenCalledTimes(10);
	});
});

describe("pullContinueWatching meta failures", () => {
	it("falls back to the bare content id when the meta lookup rejects", async () => {
		const nuvio = nuvioWith([row({ content_id: "tt7" })]);
		const lookup = vi.fn(async () => {
			throw new Error("addon down");
		});

		const [item] = await pullContinueWatching(nuvio, lookup as never);

		expect(item).toMatchObject({ id: "tt7", name: "tt7", poster: null });
	});
});

describe("pullPlaybackResume", () => {
	it("finds the episode's row by progress key, namespaced ids included", async () => {
		const episodeRow = (episode: number, position: number) =>
			row({
				progress_key: `tmdb:9_s1e${episode}`,
				content_id: "tmdb:9",
				content_type: "series",
				video_id: `tmdb:9:1:${episode}`,
				season: 1,
				episode,
				position,
				duration: 2_400_000,
			});
		const nuvio = nuvioWith([episodeRow(1, 900_000), episodeRow(2, 300_000)]);

		const resume = await pullPlaybackResume(nuvio, {
			type: "series",
			id: "tmdb:9:1:2",
		});

		expect(resume).toEqual({ position: 300_000, duration: 2_400_000 });
	});

	it("resumes an episode marked under the URL id", async () => {
		const nuvio = nuvioWith([
			row({
				progress_key: "tt9_s1e2",
				content_id: "tt9",
				content_type: "series",
				video_id: "tmdb:9:1:2",
				season: 1,
				episode: 2,
			}),
		]);

		expect(
			await pullPlaybackResume(nuvio, { type: "series", id: "tmdb:9:1:2" }),
		).toEqual({ position: 30_000, duration: 120_000 });
	});

	it("is null when the pull fails or nothing matches", async () => {
		const failing = nuvioWith(Promise.reject(new Error("down")) as never);
		expect(
			await pullPlaybackResume(failing, { type: "movie", id: "tt1" }),
		).toBeNull();
		expect(
			await pullPlaybackResume(nuvioWith([]), { type: "movie", id: "tt1" }),
		).toBeNull();
	});
});

describe("pullPlaybackMeta", () => {
	it("assembles the context from the title's meta", async () => {
		const lookup = vi.fn(async () => ({
			id: "tt1",
			type: "movie",
			name: "Film",
		}));

		const context = await pullPlaybackMeta(
			{ type: "movie", id: "tt1" },
			lookup as never,
		);

		expect(lookup).toHaveBeenCalledWith("movie", "tt1");
		expect(context).toMatchObject({ heading: "Film", contentId: "tt1" });
	});

	it("still paints a context when every meta addon fails", async () => {
		const context = await pullPlaybackMeta(
			{ type: "series", id: "tt1:1:2" },
			vi.fn(async () => {
				throw new Error("addon down");
			}) as never,
		);
		expect(context).toMatchObject({ contentId: "tt1", season: 1, episode: 2 });
	});
});

const scheduled = {
	season: 2,
	episode: 1,
	title: "Premiere",
	airsAt: "2099-01-01T00:00:00.000Z",
};

function tvmazeAnswering(episode: unknown) {
	return vi.fn(async (input: string | URL) =>
		String(input).includes("/lookup/shows")
			? new Response(
					JSON.stringify({
						_links: {
							nextepisode: { href: "https://api.tvmaze.com/episodes/1" },
						},
					}),
				)
			: new Response(JSON.stringify(episode)),
	) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const tvmazeS2E1 = {
	season: 2,
	number: 1,
	name: "Premiere",
	airstamp: "2099-01-01T00:00:00+00:00",
};

describe("pullUpcoming", () => {
	const base = {
		metaType: "series" as const,
		contentId: "tt9000001",
		season: 1,
		episode: 8,
		next: null,
		upcoming: null,
	};

	it("uses the meta's own unaired episode without asking TVmaze", async () => {
		const fetchImpl = tvmazeAnswering(tvmazeS2E1);
		expect(
			await pullUpcoming({ ...base, upcoming: scheduled }, fetchImpl),
		).toBe(scheduled);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("asks nothing when there is an aired next episode", async () => {
		const fetchImpl = tvmazeAnswering(tvmazeS2E1);
		expect(
			await pullUpcoming({ ...base, next: { videoId: "x" } }, fetchImpl),
		).toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("falls back to TVmaze once the meta has run out", async () => {
		expect(
			await pullUpcoming(
				{ ...base, contentId: "tt9000002" },
				tvmazeAnswering(tvmazeS2E1),
			),
		).toMatchObject({ season: 2, episode: 1 });
	});

	it("is null for a movie or a missing context", async () => {
		const fetchImpl = tvmazeAnswering(tvmazeS2E1);
		expect(
			await pullUpcoming({ ...base, metaType: "movie" }, fetchImpl),
		).toBeNull();
		expect(await pullUpcoming(null, fetchImpl)).toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe("pullNextToAir", () => {
	const series = (videos: NonNullable<Meta["videos"]>, id = "tt9000003") =>
		({ id, type: "series", name: "Show", videos }) as Meta;

	it("answers from the meta when it lists an unaired episode", async () => {
		const fetchImpl = tvmazeAnswering(tvmazeS2E1);
		const result = await pullNextToAir(
			series([
				{
					id: "a",
					title: "One",
					season: 1,
					episode: 1,
					released: "2020-01-01",
				},
				{
					id: "b",
					title: "Two",
					season: 1,
					episode: 2,
					released: "2099-02-02T00:00:00Z",
				},
			] as NonNullable<Meta["videos"]>),
			fetchImpl,
		);
		expect(result).toMatchObject({ season: 1, episode: 2, title: "Two" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("asks TVmaze for what comes after the last listed episode", async () => {
		const result = await pullNextToAir(
			series(
				[
					{ id: "a", title: "One", season: 1, episode: 1 },
					{ id: "b", title: "Eight", season: 1, episode: 8 },
				] as NonNullable<Meta["videos"]>,
				"tt9000004",
			),
			tvmazeAnswering(tvmazeS2E1),
		);
		expect(result).toMatchObject({ season: 2, episode: 1 });
	});

	it("lets the addon's listing win when TVmaze is behind it", async () => {
		const result = await pullNextToAir(
			series(
				[{ id: "a", title: "Nine", season: 2, episode: 9 }] as NonNullable<
					Meta["videos"]
				>,
				"tt9000005",
			),
			tvmazeAnswering(tvmazeS2E1),
		);
		expect(result).toBeNull();
	});

	it("asks TVmaze outright when the meta lists no episodes", async () => {
		expect(
			await pullNextToAir(series([], "tt9000006"), tvmazeAnswering(tvmazeS2E1)),
		).toMatchObject({ season: 2 });
	});

	it("is null for a movie or no meta", async () => {
		expect(
			await pullNextToAir({ id: "tt1", type: "movie", name: "M" } as Meta),
		).toBeNull();
		expect(await pullNextToAir(null)).toBeNull();
	});
});

describe("pullProgressRows", () => {
	it("is the profile's stored progress", async () => {
		const rows = await pullProgressRows(
			nuvioWith([row({ content_id: "tt4" })]),
		);
		expect(rows.map((entry) => entry.contentId)).toEqual(["tt4"]);
	});
});
