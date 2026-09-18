import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
}));
vi.mock("#lib/server/guards.js", () => ({ requireProfile: () => ({}) }));

import { mediaSegments } from "./segments.remote.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
	const spy = vi.fn(async () =>
		status === 200
			? new Response(JSON.stringify(body), { status })
			: new Response("err", { status }),
	);
	globalThis.fetch = spy as unknown as typeof fetch;
	return spy;
}

describe("mediaSegments", () => {
	it("returns nulls for an id nothing can map (no request made)", async () => {
		const spy = vi.fn();
		globalThis.fetch = spy as unknown as typeof fetch;
		expect(
			await mediaSegments({ contentId: "local:abc", season: 1, episode: 1 }),
		).toEqual({ intro: null, credits: null });
		expect(spy).not.toHaveBeenCalled();
	});

	it("normalises a successful response", async () => {
		mockFetch(200, {
			intro: [{ start_ms: 77_000, end_ms: 123_000 }],
			credits: [{ start_ms: 2_785_000, end_ms: null }],
		});
		expect(
			await mediaSegments({
				contentId: "tt0903747",
				season: 2,
				episode: 1,
			}),
		).toEqual({ intro: { start: 77, end: 123 }, credits: { start: 2785 } });
	});

	it("resolves to nulls on a 404 / rate limit", async () => {
		mockFetch(404, {});
		expect(
			await mediaSegments({
				contentId: "tt1375666",
				season: null,
				episode: null,
			}),
		).toEqual({ intro: null, credits: null });
	});

	it("sends a Bearer header when an apiKey is given, omits it otherwise", async () => {
		const keyed = mockFetch(200, {});
		await mediaSegments({
			contentId: "tmdb:550",
			season: null,
			episode: null,
			apiKey: "user-key-123",
		});
		const [, keyedInit] = keyed.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect((keyedInit.headers as Record<string, string>).authorization).toBe(
			"Bearer user-key-123",
		);

		const keyless = mockFetch(200, {});
		await mediaSegments({ contentId: "tmdb:550", season: null, episode: null });
		const [, keylessInit] = keyless.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(
			(keylessInit.headers as Record<string, string>).authorization,
		).toBeUndefined();
	});

	it("resolves to nulls when fetch throws", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("timeout");
		}) as unknown as typeof fetch;
		expect(
			await mediaSegments({
				contentId: "tmdb:550",
				season: null,
				episode: null,
			}),
		).toEqual({ intro: null, credits: null });
	});
});

/** Answers by URL, so one test can script TheIntroDB, ARM and AniSkip at once. */
function routeFetch(routes: Array<[RegExp, number, unknown]>) {
	const spy = vi.fn(async (input: string | URL) => {
		const url = String(input);
		const route = routes.find(([pattern]) => pattern.test(url));
		if (!route) {
			return new Response("unrouted", { status: 404 });
		}
		const [, status, body] = route;
		return new Response(JSON.stringify(body), { status });
	});
	globalThis.fetch = spy as unknown as typeof fetch;
	return spy;
}

const ANISKIP_HIT = {
	found: true,
	results: [
		{ skipType: "op", interval: { startTime: 3.2, endTime: 93.2 } },
		{ skipType: "ed", interval: { startTime: 1417.1, endTime: 1507.1 } },
	],
};

describe("mediaSegments: AniSkip fallback", () => {
	it("maps a Kitsu id through ARM and returns AniSkip's times", async () => {
		const spy = routeFetch([
			[
				/arm\.haglund\.dev\/api\/v2\/ids\?source=kitsu&id=46474/,
				200,
				{ myanimelist: 52_991 },
			],
			[/api\.aniskip\.com\/v2\/skip-times\/52991\/5\?/, 200, ANISKIP_HIT],
		]);
		expect(
			await mediaSegments({ contentId: "kitsu:46474", season: 1, episode: 5 }),
		).toEqual({ intro: { start: 3.2, end: 93.2 }, credits: { start: 1417.1 } });
		// TheIntroDB cannot take a Kitsu id, so it is never asked.
		expect(
			spy.mock.calls.some(([url]) => String(url).includes("theintrodb")),
		).toBe(false);
	});

	it("picks the MAL entry for the season an IMDb series is on", async () => {
		routeFetch([
			[/theintrodb/, 404, {}],
			[
				/arm\.haglund\.dev\/api\/v2\/imdb\?id=tt22248376/,
				200,
				[
					{ myanimelist: 52_991, "themoviedb-season": 1 },
					{ myanimelist: 59_978, "themoviedb-season": 2 },
				],
			],
			[/skip-times\/59978\/3\?/, 200, ANISKIP_HIT],
		]);
		const result = await mediaSegments({
			contentId: "tt22248376",
			season: 2,
			episode: 3,
		});
		expect(result.intro).toEqual({ start: 3.2, end: 93.2 });
	});

	it("does not ask AniSkip when TheIntroDB already had the title", async () => {
		const spy = routeFetch([
			[/theintrodb/, 200, { intro: [{ start_ms: 1000, end_ms: 60_000 }] }],
		]);
		await mediaSegments({
			contentId: "tt0111161",
			season: null,
			episode: null,
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});

	// ARM answers `[]` for anything that is not anime: that is the detection.
	it("stops at the mapping for a title that is not anime", async () => {
		const spy = routeFetch([
			[/theintrodb/, 404, {}],
			[/arm\.haglund\.dev\/api\/v2\/imdb\?id=tt0903747/, 200, []],
		]);
		expect(
			await mediaSegments({ contentId: "tt0903747", season: 1, episode: 1 }),
		).toEqual({ intro: null, credits: null });
		expect(
			spy.mock.calls.some(([url]) => String(url).includes("aniskip")),
		).toBe(false);
	});

	it("caches the id mapping across episodes", async () => {
		const spy = routeFetch([
			[/ids\?source=anilist&id=154587/, 200, { myanimelist: 52_991 }],
			[/skip-times\/52991\//, 200, ANISKIP_HIT],
		]);
		await mediaSegments({ contentId: "anilist:154587", season: 1, episode: 1 });
		await mediaSegments({ contentId: "anilist:154587", season: 1, episode: 2 });
		const armCalls = spy.mock.calls.filter(([url]) =>
			String(url).includes("haglund"),
		);
		expect(armCalls).toHaveLength(1);
	});

	it("resolves to nulls when AniSkip has no data or is unreachable", async () => {
		routeFetch([
			[/ids\?source=kitsu&id=1/, 200, { myanimelist: 1 }],
			[/skip-times/, 404, { found: false, results: [] }],
		]);
		expect(
			await mediaSegments({ contentId: "kitsu:1", season: 1, episode: 9999 }),
		).toEqual({ intro: null, credits: null });

		globalThis.fetch = vi.fn(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;
		expect(
			await mediaSegments({ contentId: "mal:2", season: 1, episode: 1 }),
		).toEqual({ intro: null, credits: null });
	});
});
