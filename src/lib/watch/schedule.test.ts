import { describe, expect, it, vi } from "vitest";
import { fromTvmazeEpisode, nextAiring, upcomingAfter } from "./schedule.ts";

/** TVmaze by URL. Each test uses its own IMDb id: the module caches per id. */
function tvmaze(show: unknown, episode: unknown, status = 200) {
	return vi.fn(async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/lookup/shows")) {
			return new Response(JSON.stringify(show), { status });
		}
		return new Response(JSON.stringify(episode), { status: 200 });
	}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const SHOW = {
	_links: { nextepisode: { href: "https://api.tvmaze.com/episodes/3673808" } },
};
const EPISODE = {
	season: 38,
	number: 1,
	name: "The Children's Book Job",
	airstamp: "2026-09-28T00:00:00+00:00",
};

describe("fromTvmazeEpisode", () => {
	it("maps season, number, name and airstamp", () => {
		expect(fromTvmazeEpisode(EPISODE)).toEqual({
			season: 38,
			episode: 1,
			title: "The Children's Book Job",
			airsAt: "2026-09-28T00:00:00.000Z",
		});
	});

	it("drops TVmaze's TBA placeholder title", () => {
		expect(fromTvmazeEpisode({ ...EPISODE, name: "TBA" })?.title).toBeNull();
	});

	it("rejects an episode too vague to show", () => {
		expect(fromTvmazeEpisode(null)).toBeNull();
		expect(fromTvmazeEpisode({ ...EPISODE, number: null })).toBeNull();
		expect(fromTvmazeEpisode({ ...EPISODE, airstamp: null })).toBeNull();
		expect(fromTvmazeEpisode({ ...EPISODE, airstamp: "soon" })).toBeNull();
	});
});

describe("nextAiring", () => {
	it("looks the show up by IMDb id and follows its next-episode link", async () => {
		const fetchImpl = tvmaze(SHOW, EPISODE);
		expect(await nextAiring("tt0096697", fetchImpl)).toMatchObject({
			season: 38,
			episode: 1,
		});
		expect(String(fetchImpl.mock.calls[0][0])).toBe(
			"https://api.tvmaze.com/lookup/shows?imdb=tt0096697",
		);
	});

	it("only asks TVmaze about IMDb ids", async () => {
		const fetchImpl = tvmaze(SHOW, EPISODE);
		expect(await nextAiring("kitsu:46474", fetchImpl)).toBeNull();
		expect(await nextAiring("tmdb:1396", fetchImpl)).toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("is null when nothing is scheduled or the show is unknown", async () => {
		expect(
			await nextAiring("tt0903747", tvmaze({ _links: {} }, null)),
		).toBeNull();
		expect(await nextAiring("tt0000001", tvmaze({}, null, 404))).toBeNull();
	});

	// The link is followed server-side: it has to stay on TVmaze.
	it("refuses a next-episode link that points anywhere else", async () => {
		const show = {
			_links: { nextepisode: { href: "https://evil.example/x" } },
		};
		const fetchImpl = tvmaze(show, EPISODE);
		expect(await nextAiring("tt0000002", fetchImpl)).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("caches per show", async () => {
		const fetchImpl = tvmaze(SHOW, EPISODE);
		await nextAiring("tt0000003", fetchImpl);
		await nextAiring("tt0000003", fetchImpl);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("is null when TVmaze cannot be reached", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("down");
		}) as unknown as typeof fetch;
		expect(await nextAiring("tt0000004", fetchImpl)).toBeNull();
	});
});

describe("upcomingAfter", () => {
	it("returns TVmaze's next airing when it is later than the episode watched", async () => {
		expect(
			(await upcomingAfter("tt0000005", 37, 22, tvmaze(SHOW, EPISODE)))?.season,
		).toBe(38);
	});

	it("is null when TVmaze has nothing scheduled", async () => {
		expect(
			await upcomingAfter("tt0000008", 1, 1, tvmaze({ _links: {} }, null)),
		).toBeNull();
	});

	// TVmaze and an addon can disagree on numbering.
	it("ignores a next airing that is not ahead of the viewer", async () => {
		expect(
			await upcomingAfter("tt0000006", 38, 1, tvmaze(SHOW, EPISODE)),
		).toBeNull();
		expect(
			await upcomingAfter("tt0000007", 39, 1, tvmaze(SHOW, EPISODE)),
		).toBeNull();
	});
});
