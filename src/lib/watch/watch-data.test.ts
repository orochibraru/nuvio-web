import { describe, expect, it, vi } from "vitest";
import type { Meta } from "#lib/addons/index.js";
import type { NuvioClient } from "#lib/nuvio/index.js";
import {
	pullContinueWatching,
	pullNextToAir,
	pullPlaybackContext,
	pullResumeRows,
	pullUpcoming,
} from "./watch-data.ts";

function nuvioWith(rows: unknown[] | Promise<never>): NuvioClient {
	return {
		watchProgress: {
			pull: vi
				.fn()
				.mockImplementation(() =>
					rows instanceof Promise ? rows : Promise.resolve(rows),
				),
		},
	} as unknown as NuvioClient;
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

describe("pullResumeRows", () => {
	it("keeps one in-progress row per title, newest first, capped at 16", async () => {
		const nuvio = nuvioWith([
			row({ content_id: "a", last_watched: 1 }),
			row({ content_id: "a", last_watched: 9, position: 60_000 }), // newer, same title
			row({ content_id: "b", last_watched: 5 }),
			row({ content_id: "c", duration: 30_000 }), // < 60s → dropped
			row({ content_id: "d", position: 119_000 }), // >= 90% → dropped
		]);

		const out = await pullResumeRows(nuvio, 1);
		expect(out.map((r) => r.id)).toEqual(["a", "b"]);
		expect(out[0]).toMatchObject({
			id: "a",
			videoId: "tt1",
			progress: 0.5,
			remainingMs: 60_000,
		});
	});

	it("degrades to an empty list on failure", async () => {
		const nuvio = nuvioWith(Promise.reject(new Error("down")) as never);
		expect(await pullResumeRows(nuvio, 1)).toEqual([]);
	});
});

describe("pullContinueWatching", () => {
	const lookup = (byId: Record<string, unknown> = {}) =>
		vi.fn(async (_type: string, id: string) => (byId[id] ?? null) as never);

	it("drops rows shorter than a minute and finished movies", async () => {
		const nuvio = nuvioWith([
			row({ content_id: "short", duration: 30_000 }),
			row({ content_id: "done", position: 595_000, duration: 600_000 }),
		]);
		expect(await pullContinueWatching(nuvio, 1, lookup())).toEqual([]);
	});

	it("keeps a mid-movie row with progress + remaining time", async () => {
		const nuvio = nuvioWith([row({ position: 300_000, duration: 600_000 })]);
		const [item] = await pullContinueWatching(
			nuvio,
			1,
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
			1,
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
		const [item] = await pullContinueWatching(nuvio, 1, lookup());
		expect(item.name).toBe("tt1");
	});

	it("keeps only the most-recent row per title", async () => {
		const nuvio = nuvioWith([
			row({ last_watched: 10, position: 60_000, duration: 600_000 }),
			row({ last_watched: 20, position: 120_000, duration: 600_000 }),
		]);
		const items = await pullContinueWatching(
			nuvio,
			1,
			lookup({ tt1: { name: "M" } }),
		);
		expect(items).toHaveLength(1);
		expect(items[0].progress).toBeCloseTo(0.2);
	});

	it("survives a watch-progress pull failure", async () => {
		const nuvio = nuvioWith(Promise.reject(new Error("500")) as never);
		expect(await pullContinueWatching(nuvio, 1, lookup())).toEqual([]);
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

		await pullContinueWatching(nuvio, 1, slowLookup);
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

		const [item] = await pullContinueWatching(nuvio, 1, lookup as never);

		expect(item).toMatchObject({ id: "tt7", name: "tt7", poster: null });
	});
});

describe("pullPlaybackContext", () => {
	it("assembles meta and the matching progress row for an episode", async () => {
		const nuvio = nuvioWith([
			{ progress_key: "tt9_s1e2", position: 300_000, duration: 2_400_000 },
		]);
		const lookup = vi.fn(async () => ({
			id: "tt9",
			type: "series",
			name: "Show",
			videos: [
				{ id: "tt9:1:1", title: "One", season: 1, episode: 1 },
				{ id: "tt9:1:2", title: "Two", season: 1, episode: 2 },
			],
		}));

		const context = await pullPlaybackContext(
			nuvio,
			1,
			{ type: "series", id: "tt9:1:2" },
			lookup as never,
		);

		expect(lookup).toHaveBeenCalledWith("series", "tt9");
		expect(context).toMatchObject({
			metaType: "series",
			contentId: "tt9",
			season: 1,
			episode: 2,
			videoId: "tt9:1:2",
		});
		expect(context.resume).toMatchObject({ position: 300_000 });
	});

	it("still returns a context when both halves fail", async () => {
		const nuvio = nuvioWith(Promise.reject(new Error("down")) as never);
		const lookup = vi.fn(async () => {
			throw new Error("addon down");
		});

		const context = await pullPlaybackContext(
			nuvio,
			1,
			{ type: "movie", id: "tt1" },
			lookup as never,
		);

		expect(context).toMatchObject({
			metaType: "movie",
			contentId: "tt1",
			season: null,
			episode: null,
		});
		expect(context.resume).toBeNull();
		expect(context.heading).toBe("tt1");
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
