import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
	state: {
		addonsList: vi.fn(),
		addonsReplace: vi.fn(),
		registry: {
			addons: [] as unknown[],
			catalogs: vi.fn(() => [] as unknown[]),
			addonCatalogs: vi.fn(() => [] as unknown[]),
		},
		errors: [] as unknown[],
		invalidateRegistry: vi.fn(),
		fetchManifest: vi.fn(),
		getCatalog: vi.fn(),
		getMeta: vi.fn(),
		getStreams: vi.fn(),
		getAddonCatalog: vi.fn(),
	},
}));

vi.mock("@sveltejs/kit", () => ({
	error: (status: number, message: string) => {
		throw Object.assign(new Error(message), { status });
	},
}));

vi.mock("$app/server", () => {
	const wrap = (schemaOrFn: unknown, fn?: unknown) => {
		const impl = (fn ?? schemaOrFn) as (...a: unknown[]) => unknown;
		// SvelteKit's `query()` result is awaitable *and* carries `.refresh()`.
		return (...a: unknown[]) =>
			Object.assign(Promise.resolve(impl(...a)), {
				refresh: vi.fn().mockResolvedValue(undefined),
			});
	};
	return {
		query: wrap,
		command: wrap,
		getRequestEvent: () => ({ locals: {}, fetch }),
	};
});

vi.mock("./manifest.ts", () => ({
	fetchManifest: (...a: unknown[]) => state.fetchManifest(...a),
}));

vi.mock("./server.ts", () => ({
	requireProfile: () => ({
		event: {
			locals: {
				nuvio: {
					addons: { list: state.addonsList, replace: state.addonsReplace },
				},
			},
		},
		profileId: 1,
	}),
	getRegistry: async () => ({ registry: state.registry, errors: state.errors }),
	getAddonClient: async () => ({
		client: {
			getCatalog: state.getCatalog,
			getMeta: state.getMeta,
			getStreams: state.getStreams,
			getAddonCatalog: state.getAddonCatalog,
		},
		registry: state.registry,
	}),
	invalidateRegistry: state.invalidateRegistry,
}));

import {
	addonCatalogSources,
	browseAddonCatalog,
	browseCatalog,
	getMeta,
	homeRows,
	installedAddons,
	previewAddon,
	saveAddons,
	searchCatalogs,
	similarTitles,
} from "./addons.remote.js";

beforeEach(() => {
	state.addonsList.mockReset().mockResolvedValue([]);
	state.addonsReplace.mockReset().mockResolvedValue(undefined);
	state.registry = {
		addons: [],
		catalogs: vi.fn(() => []),
		addonCatalogs: vi.fn(() => []),
	};
	state.errors = [];
	state.invalidateRegistry.mockReset();
	state.fetchManifest.mockReset();
	state.getCatalog.mockReset().mockResolvedValue({ metas: [] });
	state.getMeta.mockReset().mockResolvedValue(null);
	state.getAddonCatalog.mockReset().mockResolvedValue({ addons: [] });
});

describe("installedAddons", () => {
	it("sorts by sort_order and derives name + configureUrl from the manifest", async () => {
		state.addonsList.mockResolvedValue([
			{ url: "u2", name: "Two", enabled: true, sort_order: 2 },
			{ url: "u1", name: "One", enabled: false, sort_order: 1 },
		]);
		state.registry = {
			catalogs: vi.fn(() => []),
			addonCatalogs: vi.fn(() => []),
			addons: [
				{
					url: "u1",
					baseUrl: "https://a.one",
					manifest: {
						name: "Addon One",
						resources: ["catalog", { name: "meta" }],
						catalogs: [{}, {}],
						types: ["movie"],
						behaviorHints: { configurable: true },
					},
				},
			],
		};

		const out = await installedAddons();
		expect(out.addons.map((a) => a.url)).toEqual(["u1", "u2"]);
		expect(out.addons[0]).toMatchObject({
			name: "Addon One",
			enabled: false,
			resources: ["catalog", "meta"],
			catalogCount: 2,
			reachable: true,
			configureUrl: "https://a.one/configure",
		});
		// no manifest in the registry → unreachable, no configure link
		expect(out.addons[1]).toMatchObject({
			name: "Two",
			reachable: false,
			configureUrl: null,
		});
	});
});

describe("previewAddon", () => {
	it("shapes a fetched manifest on success", async () => {
		state.fetchManifest.mockResolvedValue({
			baseUrl: "https://x",
			manifest: {
				id: "org.x",
				name: "X",
				version: "1.0.0",
				resources: ["catalog"],
				types: ["movie"],
				catalogs: [{ type: "movie", id: "top", name: "Top" }],
			},
		});
		const out = await previewAddon("https://x/manifest.json");
		expect(out).toMatchObject({
			ok: true,
			baseUrl: "https://x",
			manifest: { id: "org.x", catalogCount: 1 },
		});
	});

	it("returns ok:false with the error message on failure", async () => {
		state.fetchManifest.mockRejectedValue(new Error("404 not found"));
		expect(await previewAddon("https://x/manifest.json")).toEqual({
			ok: false,
			message: "404 not found",
		});
	});
});

describe("saveAddons", () => {
	it("writes a sort-ordered payload and invalidates the registry", async () => {
		const out = await saveAddons([
			{ url: "https://b", enabled: true },
			{ url: "https://a", name: "A", enabled: false },
		]);
		expect(out).toEqual({ count: 2 });
		const payload = state.addonsReplace.mock.calls[0][0].p_addons;
		expect(payload).toEqual([
			{ url: "https://b", name: undefined, enabled: true, sort_order: 0 },
			{ url: "https://a", name: "A", enabled: false, sort_order: 1 },
		]);
		expect(state.invalidateRegistry).toHaveBeenCalled();
	});
});

describe("browseCatalog / getMeta", () => {
	it("browseCatalog throws 404 when the catalog is missing", async () => {
		state.getCatalog.mockResolvedValue(null);
		await expect(
			browseCatalog({ type: "movie", id: "nope" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("getMeta throws 404 when no addon has metadata", async () => {
		state.getMeta.mockResolvedValue(null);
		await expect(getMeta({ type: "movie", id: "tt0" })).rejects.toMatchObject({
			status: 404,
		});
	});

	it("getMeta returns the meta + addon name on a hit", async () => {
		state.getMeta.mockResolvedValue({
			meta: { name: "M" },
			addon: { manifest: { name: "Cinemeta" } },
		});
		expect(await getMeta({ type: "movie", id: "tt1" })).toEqual({
			meta: { name: "M" },
			addonName: "Cinemeta",
		});
	});
});

describe("similarTitles", () => {
	const cat = (id: string) => ({
		addon: { manifest: { id: `a-${id}` } },
		catalog: { type: "movie", id },
	});

	it("returns the first probe that yields at least six other titles", async () => {
		state.registry.catalogs = vi.fn(() => [cat("top"), cat("new")]);
		state.getCatalog.mockImplementation(async (sel: { genre?: string }) => ({
			metas:
				sel.genre === "Drama"
					? Array.from({ length: 8 }, (_, i) => ({
							id: `m${i}`,
							type: "movie",
						}))
					: [],
		}));

		const out = await similarTitles({
			type: "movie",
			id: "m0",
			genres: ["Drama", "Crime"],
		});
		// the seed title itself is filtered out
		expect(out.metas).toHaveLength(7);
		expect(out.metas.some((m) => m.id === "m0")).toBe(false);
	});

	it("returns nothing when there are no candidate catalogs", async () => {
		state.registry.catalogs = vi.fn(() => []);
		expect(
			await similarTitles({ type: "movie", id: "m0", genres: [] }),
		).toEqual({ metas: [] });
	});
});

describe("homeRows", () => {
	it("drops rows whose catalog returned nothing", async () => {
		state.registry.catalogs = vi.fn(() => [
			{
				addon: { manifest: { id: "a", name: "A" } },
				catalog: { type: "movie", id: "full", name: "Full" },
			},
			{
				addon: { manifest: { id: "b", name: "B" } },
				catalog: { type: "movie", id: "empty", name: "Empty" },
			},
		]);
		state.getCatalog.mockImplementation(async (sel: { id: string }) => ({
			metas: sel.id === "full" ? [{ id: "m1", type: "movie" }] : [],
		}));

		const out = await homeRows();
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ title: "Full", id: "full" });
	});
});

describe("searchCatalogs", () => {
	it("merges results across searchable catalogs and de-dupes by type:id", async () => {
		state.registry.catalogs = vi.fn(() => [
			{
				addon: { manifest: { id: "a" } },
				catalog: { type: "movie", id: "s1", extraSupported: ["search"] },
			},
			{
				addon: { manifest: { id: "b" } },
				catalog: { type: "movie", id: "s2", extra: [{ name: "search" }] },
			},
			{
				addon: { manifest: { id: "c" } },
				catalog: { type: "movie", id: "s3" },
			},
		]);
		state.getCatalog.mockImplementation(async (sel: { id: string }) => ({
			metas:
				sel.id === "s1"
					? [
							{ id: "m1", type: "movie" },
							{ id: "m2", type: "movie" },
						]
					: [
							{ id: "m2", type: "movie" },
							{ id: "m3", type: "movie" },
						],
		}));

		const out = await searchCatalogs("bat");
		expect(out.metas.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
		// s3 doesn't advertise search → never queried
		expect(state.getCatalog).toHaveBeenCalledTimes(2);
	});
});

describe("addonCatalogSources", () => {
	it("lists every addon_catalog across installed addons", async () => {
		state.registry.addonCatalogs = vi.fn(() => [
			{
				addon: { manifest: { id: "org.community", name: "Community" } },
				catalog: { type: "addon_catalog", id: "community", name: "Repo" },
			},
		]);
		expect(await addonCatalogSources()).toEqual([
			{
				addonId: "org.community",
				addonName: "Community",
				type: "addon_catalog",
				id: "community",
				name: "Repo",
			},
		]);
	});

	it("falls back to the addon's own name when the catalog has none", async () => {
		state.registry.addonCatalogs = vi.fn(() => [
			{
				addon: { manifest: { id: "org.x", name: "X Repo" } },
				catalog: { type: "addon_catalog", id: "main" },
			},
		]);
		const [entry] = await addonCatalogSources();
		expect(entry.name).toBe("X Repo");
	});

	it("returns an empty list when no addon advertises one", async () => {
		expect(await addonCatalogSources()).toEqual([]);
	});
});

describe("browseAddonCatalog", () => {
	it("returns the addons an addon_catalog lists", async () => {
		state.getAddonCatalog.mockResolvedValue({
			addons: [
				{
					transportUrl: "https://other.example/manifest.json",
					manifest: { id: "org.other", name: "Other", types: ["movie"] },
				},
			],
		});
		const out = await browseAddonCatalog({
			addonId: "org.community",
			type: "addon_catalog",
			id: "community",
		});
		expect(out.addons).toHaveLength(1);
		expect(out.addons[0].manifest.name).toBe("Other");
		expect(state.getAddonCatalog).toHaveBeenCalledWith(
			"org.community",
			"addon_catalog",
			"community",
		);
	});

	it("throws 404 when the catalog isn't found", async () => {
		state.getAddonCatalog.mockResolvedValue(null);
		await expect(
			browseAddonCatalog({
				addonId: "org.x",
				type: "addon_catalog",
				id: "nope",
			}),
		).rejects.toMatchObject({ status: 404 });
	});
});
