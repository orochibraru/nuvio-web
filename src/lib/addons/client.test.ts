import { beforeEach, describe, expect, it, vi } from "vitest";

// The real `safeFetch` resolves the hostname to prove it is public, which no
// test fixture host does. The SSRF guard has its own suite
// (`server/safe-fetch.test.ts`); here it is a pass-through that records the
// URL the client built.
const calls: Array<{ url: string; init: RequestInit }> = [];
vi.mock("#lib/server/safe-fetch.js", () => ({
	safeFetch: (url: string, fetchImpl: typeof fetch, init: RequestInit = {}) => {
		calls.push({ url, init });
		return fetchImpl(url, init);
	},
}));

import { AddonClient } from "./client.ts";
import { AddonRegistry, type InstalledAddon } from "./registry.ts";
import type { AddonManifest, Meta } from "./types.ts";

function manifest(over: Partial<AddonManifest> = {}): AddonManifest {
	return {
		id: "org.one",
		name: "One",
		version: "1.0.0",
		types: ["movie", "series"],
		resources: ["catalog", "meta", "stream", "subtitles"],
		catalogs: [{ type: "movie", id: "top", name: "Popular" }],
		...over,
	};
}

function installed(over: Partial<InstalledAddon> = {}): InstalledAddon {
	return {
		url: "https://one.example/manifest.json",
		name: null,
		enabled: true,
		sortOrder: 0,
		baseUrl: "https://one.example",
		manifest: manifest(),
		...over,
	};
}

/** Marks a route whose value the stub should throw rather than serve. */
class Thrown {
	constructor(readonly value: unknown) {}
}

/** A fetch that answers each URL from `routes`, matched by substring. */
function fetchStub(
	routes: Array<[match: string, body: unknown, status?: number]>,
): typeof fetch {
	return (async (url: string) => {
		const hit = routes.find(([match]) => url.includes(match));
		if (!hit) {
			return new Response("{}", { status: 404 });
		}
		const [, body, status = 200] = hit;
		if (body instanceof Thrown) {
			throw body.value;
		}
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
}

function client(
	addons: InstalledAddon[],
	fetchImpl: typeof fetch,
): AddonClient {
	return new AddonClient(new AddonRegistry(addons), fetchImpl);
}

beforeEach(() => {
	calls.length = 0;
});

describe("getCatalog", () => {
	it("builds the resource URL and normalizes the metas", async () => {
		const result = await client(
			[installed()],
			fetchStub([
				[
					"/catalog/movie/top.json",
					{
						metas: [
							{ id: "tt1", type: "movie", name: "A", genres: "Sci-Fi, Drama" },
							{ id: "tt2", type: "movie", name: "B", genres: ["Drama", 7] },
							{ id: "tt3", type: "movie", name: "C" },
						],
					},
				],
			]),
		).getCatalog({ type: "movie", id: "top" });

		expect(calls[0].url).toBe("https://one.example/catalog/movie/top.json");
		expect(result?.metas.map((meta) => meta.genres)).toEqual([
			["Sci-Fi", "Drama"],
			["Drama"],
			[],
		]);
		expect(result?.from.addon.manifest.id).toBe("org.one");
	});

	it("appends search / genre / skip as an extra segment, dropping empties", async () => {
		await client(
			[installed()],
			fetchStub([["/catalog/", { metas: [] }]]),
		).getCatalog({
			type: "movie",
			id: "top",
			search: "blade runner",
			genre: "Drama",
			skip: 100,
		});

		expect(calls[0].url).toBe(
			"https://one.example/catalog/movie/top/search=blade%20runner&genre=Drama&skip=100.json",
		);
	});

	it("targets a named addon when one is given", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const result = await client(
			[installed(), two],
			fetchStub([["two.example", { metas: [] }]]),
		).getCatalog({ type: "movie", id: "top" }, "org.two");

		expect(calls[0].url).toContain("two.example");
		expect(result?.from.addon.manifest.id).toBe("org.two");
	});

	it("returns null when no addon serves that catalog", async () => {
		expect(
			await client([installed()], fetchStub([])).getCatalog({
				type: "series",
				id: "missing",
			}),
		).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it("tolerates a response with no metas array", async () => {
		const result = await client(
			[installed()],
			fetchStub([["/catalog/", { unexpected: true }]]),
		).getCatalog({ type: "movie", id: "top" });
		expect(result?.metas).toEqual([]);
	});
});

describe("getMeta", () => {
	it("keeps the first provider (registry order) that returns a meta", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const result = await client(
			[installed(), two],
			fetchStub([
				["one.example", { meta: null }],
				["two.example", { meta: { id: "tt1", type: "movie", name: "B" } }],
			]),
		).getMeta("movie", "tt1");

		expect(result?.meta.name).toBe("B");
		expect(result?.addon.manifest.id).toBe("org.two");
	});

	it("skips a provider that threw", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const result = await client(
			[installed(), two],
			fetchStub([
				["one.example", {}, 500],
				["two.example", { meta: { id: "tt1", type: "movie", name: "B" } }],
			]),
		).getMeta("movie", "tt1");

		expect(result?.addon.manifest.id).toBe("org.two");
	});

	it("returns null when nobody has it", async () => {
		expect(
			await client(
				[installed()],
				fetchStub([["/meta/", { meta: null }]]),
			).getMeta("movie", "tt1"),
		).toBeNull();
	});

	it("reads cast / director / writer out of links when the flat fields are empty", async () => {
		const meta: Meta = {
			id: "tt1",
			type: "movie",
			name: "A",
			links: [
				{ name: "  Ana ", category: "Cast", url: "stremio:///search" },
				{ name: "Ridley", category: "directors", url: "stremio:///search" },
				{ name: "Hampton", category: "Writers", url: "stremio:///search" },
				{ name: "", category: "Cast", url: "stremio:///search" },
				{ name: "Sci-Fi", category: "Genres", url: "stremio:///search" },
			],
		};
		const result = await client(
			[installed()],
			fetchStub([["/meta/", { meta }]]),
		).getMeta("movie", "tt1");

		expect(result?.meta.cast).toEqual(["Ana"]);
		expect(result?.meta.director).toEqual(["Ridley"]);
		expect(result?.meta.writer).toEqual(["Hampton"]);
	});

	it("prefers the flat fields, splitting a comma string", async () => {
		const result = await client(
			[installed()],
			fetchStub([
				[
					"/meta/",
					{
						meta: {
							id: "tt1",
							type: "movie",
							name: "A",
							cast: "Ana, Ryan",
							director: ["Denis"],
							writer: ["Hampton"],
							links: [{ name: "Nobody", category: "Cast", url: "x" }],
						},
					},
				],
			]),
		).getMeta("movie", "tt1");

		expect(result?.meta.cast).toEqual(["Ana", "Ryan"]);
		expect(result?.meta.director).toEqual(["Denis"]);
		expect(result?.meta.writer).toEqual(["Hampton"]);
	});

	it("normalizes episodes: name→title, number→episode, imdbRating→rating", async () => {
		const result = await client(
			[installed()],
			fetchStub([
				[
					"/meta/",
					{
						meta: {
							id: "tt1",
							type: "series",
							name: "S",
							videos: [
								{ id: "1", name: "Pilot", number: 1, imdbRating: 8.4 },
								{ id: "2", episode: 2, description: "d", firstAired: "2020" },
								{ id: "3", rating: "0" },
							],
						},
					},
				],
			]),
		).getMeta("series", "tt1");

		const videos = result?.meta.videos ?? [];
		expect(videos[0]).toMatchObject({
			title: "Pilot",
			episode: 1,
			rating: "8.4",
		});
		expect(videos[1]).toMatchObject({
			title: "Episode 2",
			overview: "d",
			released: "2020",
		});
		expect(videos[2]).toMatchObject({ title: "Episode", rating: undefined });
	});
});

describe("getStreams", () => {
	it("stamps every stream with the addon that served it", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const { streams, errors } = await client(
			[installed(), two],
			fetchStub([
				["one.example", { streams: [{ url: "https://a/1" }] }],
				["two.example", { streams: [{ url: "https://b/2" }] }],
			]),
		).getStreams("movie", "tt1");

		expect(errors).toEqual([]);
		expect(streams).toEqual([
			{ url: "https://a/1", addonId: "org.one", addonName: "One" },
			{ url: "https://b/2", addonId: "org.two", addonName: "Two" },
		]);
	});

	it("collects a failing addon as an error instead of failing the fan-out", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const { streams, errors } = await client(
			[installed(), two],
			fetchStub([
				["one.example", {}, 503],
				["two.example", { streams: [{ url: "https://b/2" }] }],
			]),
		).getStreams("movie", "tt1");

		expect(streams).toHaveLength(1);
		expect(errors).toEqual([
			{
				addonUrl: "https://one.example/manifest.json",
				addonName: "One",
				resource: "stream",
				message: "stream request failed with 503",
			},
		]);
	});

	it("names a timeout and a non-Error throw", async () => {
		const two = installed({
			baseUrl: "https://two.example",
			manifest: manifest({ id: "org.two", name: "Two" }),
		});
		const { errors } = await client(
			[installed(), two],
			fetchStub([
				[
					"one.example",
					new Thrown(new DOMException("aborted", "TimeoutError")),
				],
				["two.example", new Thrown("not an error")],
			]),
		).getStreams("movie", "tt1");

		expect(errors.map((entry) => entry.message)).toEqual(
			expect.arrayContaining(["Addon timed out", "Addon request failed"]),
		);
	});

	it("asks nobody when no addon serves the type", async () => {
		const narrow = installed({
			manifest: manifest({
				resources: [{ name: "stream", types: ["series"] }],
			}),
		});
		const { streams, errors } = await client(
			[narrow],
			fetchStub([]),
		).getStreams("movie", "tt1");
		expect(streams).toEqual([]);
		expect(errors).toEqual([]);
		expect(calls).toHaveLength(0);
	});
});

describe("getSubtitles", () => {
	it("stamps the source and forwards the extra segment", async () => {
		const { subtitles } = await client(
			[installed()],
			fetchStub([
				[
					"/subtitles/",
					{ subtitles: [{ id: "s1", url: "https://s/1", lang: "eng" }] },
				],
			]),
		).getSubtitles("movie", "tt1", { videoHash: "abc" });

		expect(calls[0].url).toBe(
			"https://one.example/subtitles/movie/tt1/videoHash=abc.json",
		);
		expect(subtitles[0]).toMatchObject({ id: "s1", addonId: "org.one" });
	});
});

describe("getAddonCatalog", () => {
	const withDirectory = installed({
		manifest: manifest({
			resources: ["addon_catalog"],
			addonCatalogs: [{ type: "all", id: "community" }],
		}),
	});

	it("returns null when that catalog is not advertised", async () => {
		expect(
			await client([withDirectory], fetchStub([])).getAddonCatalog(
				"org.one",
				"all",
				"nope",
			),
		).toBeNull();
	});

	it("drops entries missing a transport URL, an id or a name", async () => {
		const result = await client(
			[withDirectory],
			fetchStub([
				[
					"/addon_catalog/",
					{
						addons: [
							null,
							"a string",
							{ manifest: { id: "a", name: "A" } },
							{ transportUrl: "", manifest: { id: "a", name: "A" } },
							{ transportUrl: "https://x/manifest.json" },
							{
								transportUrl: "https://x/manifest.json",
								manifest: { name: "A" },
							},
							{
								transportUrl: "https://x/manifest.json",
								manifest: { id: "a" },
							},
							{
								transportUrl: "https://ok/manifest.json",
								manifest: {
									id: "org.ok",
									name: "Ok",
									description: 42,
									logo: "https://logo",
									types: ["movie", 7],
								},
							},
						],
					},
				],
			]),
		).getAddonCatalog("org.one", "all", "community");

		expect(result?.addons).toEqual([
			{
				transportUrl: "https://ok/manifest.json",
				manifest: {
					id: "org.ok",
					name: "Ok",
					description: undefined,
					logo: "https://logo",
					types: ["movie"],
				},
			},
		]);
	});

	it("defaults types to an empty list when the manifest omits them", async () => {
		const result = await client(
			[withDirectory],
			fetchStub([
				[
					"/addon_catalog/",
					{
						addons: [
							{
								transportUrl: "https://ok/manifest.json",
								manifest: {
									id: "org.ok",
									name: "Ok",
									description: "A directory",
								},
							},
						],
					},
				],
			]),
		).getAddonCatalog("org.one", "all", "community");

		expect(result?.addons[0].manifest).toMatchObject({
			description: "A directory",
			types: [],
		});
	});
});
