import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddonManifest } from "./types.ts";

const state = {
	profileId: 7,
	list: vi.fn(async (_profileId: number) => [] as unknown[]),
	manifest: vi.fn(async (url: string) => ({
		manifest: {} as AddonManifest,
		baseUrl: url,
	})),
	throwOnRequire: false as boolean,
};

const event = {
	fetch: (async () => new Response("{}")) as unknown as typeof fetch,
	locals: { nuvio: { addons: { list: (id: number) => state.list(id) } } },
};

vi.mock("$app/server", () => ({ getRequestEvent: () => event }));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => {
		if (state.throwOnRequire) {
			throw new Error("No active profile");
		}
		return { event, nuvio: event.locals.nuvio, profileId: state.profileId };
	},
}));

// The registry is built for real (that is the part worth exercising here); only
// the network hop for each manifest is stubbed.
vi.mock("./manifest.ts", () => ({
	fetchManifest: (url: string) => state.manifest(url),
}));

// `catalog-queries.ts` has its own suite. Here we only care that each wrapper
// hands it this request's client and registry.
vi.mock("./catalog-queries.ts", () => ({
	homeCatalogRows: vi.fn(async () => [{ marker: "home" }]),
	searchAllCatalogs: vi.fn(async (_c: unknown, _r: unknown, term: string) => ({
		metas: [{ id: term }],
	})),
	similarToTitle: vi.fn(async (_c: unknown, _r: unknown, args: unknown) => ({
		metas: [args],
	})),
	catalogPage: vi.fn(async (_c: unknown, selector: unknown) => ({
		metas: [],
		addon: { id: "a", name: selector as string },
	})),
	titleMeta: vi.fn(async (_c: unknown, type: string, id: string) => ({
		meta: { id, type },
		addonName: "One",
	})),
}));

import * as queries from "./catalog-queries.ts";
import { AddonClient } from "./client.ts";
import {
	catalogPage,
	getAddonClient,
	getRegistry,
	homeCatalogRows,
	invalidateRegistry,
	listCatalogs,
	searchAllCatalogs,
	similarToTitle,
	titleMeta,
} from "./server.ts";

function manifest(over: Partial<AddonManifest> = {}): AddonManifest {
	return {
		id: "org.one",
		name: "One",
		version: "1.0.0",
		types: ["movie"],
		resources: ["catalog"],
		catalogs: [{ type: "movie", id: "top", name: "Popular" }],
		...over,
	};
}

function row(url = "https://one.example/manifest.json") {
	return { url, name: null, enabled: true, sort_order: 0 };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	invalidateRegistry();
	state.profileId = 7;
	state.throwOnRequire = false;
	state.list = vi.fn(async () => [row()]);
	state.manifest = vi.fn(async (url: string) => ({
		manifest: manifest(),
		baseUrl: url.replace("/manifest.json", ""),
	}));
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("getRegistry", () => {
	it("builds the registry from the profile's addon rows", async () => {
		const { registry, errors } = await getRegistry();
		expect(errors).toEqual([]);
		expect(registry.addons).toHaveLength(1);
		expect(state.list).toHaveBeenCalledWith(7);
	});

	it("serves the cached registry inside the TTL", async () => {
		await getRegistry();
		vi.advanceTimersByTime(59_000);
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(1);
	});

	it("rebuilds once the TTL is past", async () => {
		await getRegistry();
		vi.advanceTimersByTime(61_000);
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(2);
	});

	it("rebuilds far sooner when the last build could not reach an addon", async () => {
		state.manifest = vi.fn(async () => {
			throw new Error("unreachable");
		});
		const first = await getRegistry();
		expect(first.errors).toHaveLength(1);

		vi.advanceTimersByTime(4000);
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2000);
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(2);
	});

	it("does not serve one profile's registry to another", async () => {
		await getRegistry();
		state.profileId = 8;
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(2);
	});

	it("is rebuilt after invalidateRegistry()", async () => {
		await getRegistry();
		invalidateRegistry();
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(2);
	});
});

describe("listCatalogs", () => {
	it("flattens every catalog across the enabled addons", async () => {
		expect(await listCatalogs()).toEqual([
			{
				addonId: "org.one",
				addonName: "One",
				type: "movie",
				id: "top",
				name: "Popular",
				genres: [],
				extraSupported: [],
			},
		]);
	});

	it("falls back to the addon name and reads extras off `extra`", async () => {
		state.manifest = vi.fn(async (url: string) => ({
			manifest: manifest({
				catalogs: [
					{
						type: "movie",
						id: "top",
						genres: ["Drama"],
						extra: [{ name: "skip" }, { name: "search" }],
					},
				],
			}),
			baseUrl: url,
		}));
		const [entry] = await listCatalogs();
		expect(entry.name).toBe("One");
		expect(entry.genres).toEqual(["Drama"]);
		expect(entry.extraSupported).toEqual(["skip", "search"]);
	});

	it("prefers an explicit extraSupported list", async () => {
		state.manifest = vi.fn(async (url: string) => ({
			manifest: manifest({
				catalogs: [
					{
						type: "movie",
						id: "top",
						extraSupported: ["genre"],
						extra: [{ name: "skip" }],
					},
				],
			}),
			baseUrl: url,
		}));
		expect((await listCatalogs())[0].extraSupported).toEqual(["genre"]);
	});

	it("is empty rather than throwing when there is no active profile", async () => {
		state.throwOnRequire = true;
		expect(await listCatalogs()).toEqual([]);
	});
});

describe("getAddonClient", () => {
	it("hands back a client bound to this request's fetch", async () => {
		const { client, registry, errors } = await getAddonClient();
		expect(client).toBeInstanceOf(AddonClient);
		expect(registry.addons).toHaveLength(1);
		expect(errors).toEqual([]);
	});
});

describe("request-scoped wrappers", () => {
	it("delegate to catalog-queries with this request's client", async () => {
		expect(await homeCatalogRows()).toEqual([{ marker: "home" }]);
		expect(await searchAllCatalogs("dune")).toEqual({
			metas: [{ id: "dune" }],
		});
		expect(await similarToTitle("movie", "tt1", ["Drama"])).toEqual({
			metas: [{ type: "movie", id: "tt1", genres: ["Drama"] }],
		});
		expect(
			await catalogPage({ type: "movie", id: "top" } as never),
		).toMatchObject({ metas: [] });
		expect(await titleMeta("movie", "tt1")).toEqual({
			meta: { id: "tt1", type: "movie" },
			addonName: "One",
		});

		for (const query of [
			queries.homeCatalogRows,
			queries.searchAllCatalogs,
			queries.similarToTitle,
			queries.catalogPage,
			queries.titleMeta,
		]) {
			expect(query).toHaveBeenCalledTimes(1);
			expect(vi.mocked(query).mock.calls[0][0]).toBeInstanceOf(AddonClient);
		}
	});
});
