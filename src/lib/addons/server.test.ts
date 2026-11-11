import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddonManifest } from "./types.ts";

const state = {
	profileId: 7,
	// Unique per test: the registry cache is module-level and keyed by
	// account + profile, so a fresh account id is what isolates one test's
	// cache entries from the next one's.
	userId: "user-a",
	list: vi.fn(async (_profileId: number) => [] as unknown[]),
	manifest: vi.fn(async (url: string, _impl?: unknown) => ({
		manifest: {} as AddonManifest,
		baseUrl: url,
	})),
	throwOnRequire: false as boolean,
	profiles: [] as Array<{
		profile_index: number;
		name: string;
		uses_primary_addons: boolean;
	}>,
};

const event = {
	// Forwards the visitor's cookies: the addon layer must never be handed it.
	fetch: (async () => {
		throw new Error("event.fetch reached the addon layer");
	}) as unknown as typeof fetch,
	locals: {
		services: { get: () => ({ warn: () => {} }) },
		nuvio: {
			addons: { list: (id: number) => state.list(id) },
			profiles: { list: async () => state.profiles },
			// The home rows read the profile's saved layout.
			homeCatalog: {
				pull: async () => [
					{ settings_json: { rows: [], hidden_catalogs: ["a|movie|x"] } },
				],
			},
		},
		get session() {
			return { user: { id: state.userId }, accountKey: state.userId };
		},
		get profileId() {
			return state.profileId;
		},
	},
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
vi.mock("./manifest.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("./manifest.ts")>()),
	fetchManifest: (url: string, impl: unknown) => state.manifest(url, impl),
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
	addonDirectory: vi.fn(async (_c: unknown, _r: unknown, urls: string[]) => ({
		sources: [],
		addons: urls,
	})),
}));

import type { NuvioClient } from "#lib/nuvio/index.js";
import { pinnedFetch } from "#lib/server/safe-fetch.js";
import * as queries from "./catalog-queries.ts";
import { AddonClient } from "./client.ts";
import {
	addonDetails,
	addonDirectory,
	catalogPage,
	getAddonClient,
	getRegistry,
	homeCatalogRows,
	installedAddonRows,
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
	state.userId = crypto.randomUUID();
	state.profileId = 7;
	state.throwOnRequire = false;
	state.profiles = [];
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

	// `profileId` is the profile *index*, 1..6 within one account, so two
	// accounts that both picked profile 1 collide on it. Keying the cache on it
	// alone served account B account A's addons for the length of the TTL.
	it("does not serve one account's registry to another on the same profile", async () => {
		const [accountA, accountB] = [`${state.userId}-a`, `${state.userId}-b`];
		state.userId = accountA;
		const first = await getRegistry();
		expect(first.registry.addons[0].url).toBe(
			"https://one.example/manifest.json",
		);

		state.userId = accountB;
		state.list = vi.fn(async () => [row("https://two.example/manifest.json")]);
		const second = await getRegistry();

		expect(state.list).toHaveBeenCalledTimes(1);
		expect(second.registry.addons[0].url).toBe(
			"https://two.example/manifest.json",
		);
	});

	// `requireProfile()` guarantees a session in real requests; without one the
	// registry is built fresh and never cached under a shared key.
	it("builds without caching when the request has no user", async () => {
		const saved = state.userId;
		state.userId = "";
		try {
			await getRegistry();
			await getRegistry();
			expect(state.list).toHaveBeenCalledTimes(2);
		} finally {
			state.userId = saved;
		}
	});

	it("invalidateRegistry() leaves other accounts' entries alone", async () => {
		const [accountA, accountB] = [`${state.userId}-a`, `${state.userId}-b`];
		state.userId = accountA;
		await getRegistry();
		state.userId = accountB;
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(2);

		// B edits its addons; A's cached registry must survive.
		invalidateRegistry();
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(3);

		state.userId = accountA;
		await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(3);
	});

	it("does not cache a build that invalidateRegistry() overtook", async () => {
		let release: (rows: unknown[]) => void = () => {};
		state.list = vi.fn(
			() =>
				new Promise<unknown[]>((resolve) => {
					release = resolve;
				}),
		);
		const stale = getRegistry();
		await vi.waitFor(() => expect(state.list).toHaveBeenCalled());
		invalidateRegistry();
		release([row()]);
		await stale;

		state.list = vi.fn(async () => []);
		const { registry } = await getRegistry();
		expect(state.list).toHaveBeenCalledTimes(1);
		expect(registry.addons).toHaveLength(0);
	});

	it("uses the main profile's addons when the profile shares them", async () => {
		state.profiles = [
			{ profile_index: 1, name: "Main", uses_primary_addons: false },
			{ profile_index: 7, name: "Kid", uses_primary_addons: true },
		];
		await getRegistry();
		expect(state.list).toHaveBeenCalledWith(1);
	});

	it("drops every profile of the account when one edits, the main's addons being shared", async () => {
		await getRegistry();
		state.profileId = 1;
		invalidateRegistry();
		state.profileId = 7;
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
	it("hands back a client on the pinned, cookie-less fetch", async () => {
		const { client, registry, errors } = await getAddonClient();
		expect(client).toBeInstanceOf(AddonClient);
		expect((client as unknown as { fetchImpl: unknown }).fetchImpl).toBe(
			pinnedFetch,
		);
		expect(state.manifest.mock.calls.at(-1)?.[1]).toBe(pinnedFetch);
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

		// The saved home layout reaches the query as its third argument.
		expect(vi.mocked(queries.homeCatalogRows).mock.calls[0][2]).toEqual({
			rows: [],
			hidden_catalogs: ["a|movie|x"],
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

describe("addon browsing", () => {
	const nuvio = {
		profiles: { list: async () => [] },
		addons: {
			list: async () => [
				{
					url: "https://two.example/manifest.json",
					name: "Two",
					enabled: false,
					sort_order: 2,
				},
				{
					url: "https://one.example/",
					name: null,
					enabled: true,
					sort_order: 1,
				},
			],
		},
	} as unknown as NuvioClient;

	it("lists installed rows in order, disabled ones included, with a comparable base URL", async () => {
		expect(await installedAddonRows(nuvio, 7)).toEqual([
			{
				url: "https://one.example/",
				baseUrl: "https://one.example",
				name: undefined,
				enabled: true,
			},
			{
				url: "https://two.example/manifest.json",
				baseUrl: "https://two.example",
				name: "Two",
				enabled: false,
			},
		]);
	});

	it("hands the directory this request's client and the installed URLs", async () => {
		expect(await addonDirectory(nuvio, 7)).toEqual({
			sources: [],
			addons: ["https://one.example/", "https://two.example/manifest.json"],
		});
		expect(vi.mocked(queries.addonDirectory).mock.calls[0][0]).toBeInstanceOf(
			AddonClient,
		);
	});

	it("loads one manifest on the pinned fetch, or says why it could not", async () => {
		state.manifest.mockResolvedValueOnce({
			manifest: manifest(),
			baseUrl: "https://one.example",
		});
		expect(await addonDetails("https://one.example/manifest.json")).toEqual({
			ok: true,
			baseUrl: "https://one.example",
			manifest: manifest(),
		});
		expect(state.manifest.mock.calls.at(-1)?.[1]).toBe(pinnedFetch);

		state.manifest.mockRejectedValueOnce(
			new Error("Manifest request failed with 404"),
		);
		expect(await addonDetails("https://gone.example")).toEqual({
			ok: false,
			reason: 404,
		});
	});
});
