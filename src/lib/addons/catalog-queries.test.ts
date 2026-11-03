import { describe, expect, it, vi } from "vitest";
import {
	addonDirectory,
	type CatalogSource,
	catalogPage,
	homeCatalogRows,
	searchAllCatalogs,
	similarToTitle,
	titleMeta,
} from "./catalog-queries.ts";
import { decodeAddonId } from "./directory.ts";
import type { AddonRegistry } from "./registry.ts";

function registryWith(catalogs: unknown[]): AddonRegistry {
	return { catalogs: () => catalogs } as unknown as AddonRegistry;
}

function ref(over: {
	addonId?: string;
	addonName?: string;
	type?: string;
	id: string;
	name?: string;
	extraRequired?: string[];
	extraSupported?: string[];
	extra?: Array<{ name: string }>;
}) {
	return {
		addonId: over.addonId ?? `a-${over.id}`,
		addon: { manifest: { name: over.addonName ?? "Addon" } },
		catalog: {
			type: over.type ?? "movie",
			id: over.id,
			name: over.name,
			extraRequired: over.extraRequired,
			extraSupported: over.extraSupported,
			extra: over.extra,
		},
	};
}

// Fixtures are deliberately partial : these functions only touch a few fields,
// and spelling out whole `Meta` / `MetaPreview` objects would bury the point.
function source(over: Record<string, unknown> = {}): CatalogSource {
	return {
		getCatalog: vi.fn(async () => ({
			metas: [],
			from: { addonId: "a", addon: { manifest: { name: "A" } } },
		})),
		getMeta: vi.fn(async () => null),
		...over,
	} as unknown as CatalogSource;
}

describe("homeCatalogRows", () => {
	const fullSource = () =>
		source({
			getCatalog: vi.fn(async (query: { id: string }) => ({
				metas: [{ id: `m-${query.id}`, type: "movie" }],
			})),
		});
	const catalogs = (count: number) =>
		Array.from({ length: count }, (_, index) => ref({ id: `c${index}` }));

	it("shows the first eight catalogs when no layout is saved", async () => {
		const rows = await homeCatalogRows(
			fullSource(),
			registryWith(catalogs(12)),
		);
		expect(rows.map((row) => row.id)).toEqual([
			"c0",
			"c1",
			"c2",
			"c3",
			"c4",
			"c5",
			"c6",
			"c7",
		]);
	});

	it("follows the saved order and drops hidden catalogs", async () => {
		const rows = await homeCatalogRows(
			fullSource(),
			registryWith(catalogs(4)),
			{
				rows: ["a-c2|movie|c2", "a-c0|movie|c0"],
				hidden_catalogs: ["a-c1|movie|c1"],
			},
		);
		// Arranged ones first, then the unplaced one (c3) in addon order.
		expect(rows.map((row) => row.id)).toEqual(["c2", "c0", "c3"]);
	});

	it("shows more rows once the user has arranged them", async () => {
		const rows = await homeCatalogRows(
			fullSource(),
			registryWith(catalogs(20)),
			{
				rows: [],
				hidden_catalogs: ["a-c0|movie|c0"],
			},
		);
		expect(rows).toHaveLength(16);
	});

	it("drops rows whose catalog returned nothing, and rows that threw", async () => {
		const client = source({
			getCatalog: vi.fn(async (query: { id: string }) => {
				if (query.id === "boom") {
					throw new Error("addon down");
				}
				return {
					metas: query.id === "full" ? [{ id: "m1", type: "movie" }] : [],
					from: { addonId: "a", addon: { manifest: { name: "A" } } },
				};
			}),
		});

		const rows = await homeCatalogRows(
			client,
			registryWith([
				ref({ id: "full", name: "Full" }),
				ref({ id: "empty", name: "Empty" }),
				ref({ id: "boom", name: "Boom" }),
			]),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "full", title: "Full" });
	});

	it("skips catalogs that require an extra the feed can't supply", async () => {
		const client = source();
		await homeCatalogRows(
			client,
			registryWith([ref({ id: "needs-search", extraRequired: ["search"] })]),
		);
		expect(client.getCatalog).not.toHaveBeenCalled();
	});

	it("caps each row at 20 titles", async () => {
		const client = source({
			getCatalog: vi.fn(async () => ({
				metas: Array.from({ length: 50 }, (_, i) => ({
					id: `m${i}`,
					type: "movie",
				})),
				from: { addonId: "a", addon: { manifest: { name: "A" } } },
			})),
		});
		const rows = await homeCatalogRows(
			client,
			registryWith([ref({ id: "x" })]),
		);
		expect(rows[0].metas).toHaveLength(20);
	});

	it("never has more than a handful of catalog fetches in flight", async () => {
		let active = 0;
		let peak = 0;
		const client = source({
			getCatalog: vi.fn(async () => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 5));
				active -= 1;
				return {
					metas: [{ id: "m", type: "movie" }],
					from: { addonId: "a", addon: { manifest: { name: "A" } } },
				};
			}),
		});

		await homeCatalogRows(
			client,
			registryWith(Array.from({ length: 8 }, (_, i) => ref({ id: `c${i}` }))),
		);
		expect(peak).toBeLessThanOrEqual(4);
	});
});

describe("searchAllCatalogs", () => {
	it("merges results across searchable catalogs and de-dupes by type:id", async () => {
		const client = source({
			getCatalog: vi.fn(async (query: { id: string }) => ({
				metas:
					query.id === "s1"
						? [
								{ id: "m1", type: "movie" },
								{ id: "m2", type: "movie" },
							]
						: [
								{ id: "m2", type: "movie" },
								{ id: "m3", type: "movie" },
							],
				from: { addonId: "a", addon: { manifest: { name: "A" } } },
			})),
		});

		const out = await searchAllCatalogs(
			client,
			registryWith([
				ref({ id: "s1", extraSupported: ["search"] }),
				ref({ id: "s2", extra: [{ name: "search" }] }),
				ref({ id: "s3" }), // advertises no search → never queried
			]),
			"bat",
		);
		expect(out.metas.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
		expect(client.getCatalog).toHaveBeenCalledTimes(2);
	});

	it("swallows a failing catalog instead of failing the whole search", async () => {
		const client = source({
			getCatalog: vi.fn(async () => {
				throw new Error("nope");
			}),
		});
		expect(
			await searchAllCatalogs(
				client,
				registryWith([ref({ id: "s1", extraSupported: ["search"] })]),
				"x",
			),
		).toEqual({ metas: [] });
	});
});

describe("similarToTitle", () => {
	it("returns the first probe that yields at least six other titles", async () => {
		const client = source({
			getCatalog: vi.fn(async (query: { genre?: string }) => ({
				metas:
					query.genre === "Drama"
						? Array.from({ length: 8 }, (_, i) => ({
								id: `m${i}`,
								type: "movie",
							}))
						: [],
				from: { addonId: "a", addon: { manifest: { name: "A" } } },
			})),
		});

		const out = await similarToTitle(
			client,
			registryWith([ref({ id: "top" }), ref({ id: "new" })]),
			{ type: "movie", id: "m0", genres: ["Drama", "Crime"] },
		);
		// the seed title itself is filtered out
		expect(out.metas).toHaveLength(7);
		expect(out.metas.some((m) => m.id === "m0")).toBe(false);
	});

	it("returns nothing when there are no candidate catalogs", async () => {
		expect(
			await similarToTitle(source(), registryWith([]), {
				type: "movie",
				id: "m0",
				genres: [],
			}),
		).toEqual({ metas: [] });
	});

	it("only considers catalogs of the same type", async () => {
		const client = source();
		await similarToTitle(
			client,
			registryWith([ref({ id: "s", type: "series" })]),
			{
				type: "movie",
				id: "m0",
				genres: [],
			},
		);
		expect(client.getCatalog).not.toHaveBeenCalled();
	});
});

describe("catalogPage", () => {
	it("shapes the page and names the addon it came from", async () => {
		const client = source({
			getCatalog: vi.fn(async () => ({
				metas: [{ id: "m1", type: "movie" }],
				from: { addonId: "org.x", addon: { manifest: { name: "X" } } },
			})),
		});
		expect(await catalogPage(client, { type: "movie", id: "top" })).toEqual({
			metas: [{ id: "m1", type: "movie" }],
			addon: { id: "org.x", name: "X" },
		});
	});

	it("is null when no addon serves that catalog", async () => {
		const client = source({
			getCatalog: vi.fn(async () => null),
		});
		expect(await catalogPage(client, { type: "movie", id: "nope" })).toBeNull();
	});

	it("passes paging and filter options straight through", async () => {
		const client = source();
		await catalogPage(client, {
			type: "movie",
			id: "top",
			addonId: "org.x",
			genre: "Drama",
			skip: 40,
		});
		expect(client.getCatalog).toHaveBeenCalledWith(
			{
				type: "movie",
				id: "top",
				genre: "Drama",
				skip: 40,
				search: undefined,
			},
			"org.x",
		);
	});
});

describe("titleMeta", () => {
	it("returns the meta plus the addon that answered", async () => {
		const client = source({
			getMeta: vi.fn(async () => ({
				meta: { name: "M" },
				addon: { manifest: { name: "Cinemeta" } },
			})),
		});
		expect(await titleMeta(client, "movie", "tt1")).toEqual({
			meta: { name: "M" },
			addonName: "Cinemeta",
		});
	});

	it("is null when nothing has it", async () => {
		expect(await titleMeta(source(), "movie", "tt0")).toBeNull();
	});
});

describe("addonDirectory", () => {
	const directoryRef = (addonId: string, id: string, name?: string) => ({
		addonId,
		addon: { manifest: { name: `${addonId} addon` } },
		catalog: { type: "all", id, name },
	});
	const entry = (transportUrl: string, name: string) => ({
		transportUrl,
		manifest: { id: name, name, types: ["movie"], resources: ["stream"] },
	});

	it("merges every directory, one entry per addon, and marks installed ones", async () => {
		const getAddonCatalog = vi.fn(async (addonId: string) => {
			if (addonId === "broken") {
				throw new Error("timeout");
			}
			return addonId === "one"
				? {
						addons: [
							entry("https://a.example/manifest.json", "A"),
							entry("https://b.example/manifest.json", "B"),
						],
					}
				: { addons: [entry("https://a.example/", "A again")] };
		});
		const registry = {
			addonCatalogs: () => [
				directoryRef("one", "community", "Community"),
				directoryRef("two", "extra"),
				directoryRef("broken", "dead"),
			],
		} as unknown as AddonRegistry;

		const result = await addonDirectory({ getAddonCatalog }, registry, [
			"https://b.example",
		]);

		expect(result.sources).toEqual([
			{
				key: "one|all|community",
				name: "Community",
				addonName: "one addon",
				failed: false,
			},
			{
				key: "two|all|extra",
				name: "two addon",
				addonName: "two addon",
				failed: false,
			},
			{
				key: "broken|all|dead",
				name: "broken addon",
				addonName: "broken addon",
				failed: true,
			},
		]);
		expect(
			result.addons.map(({ name, sources, installed }) => ({
				name,
				sources,
				installed,
			})),
		).toEqual([
			{
				name: "A",
				sources: ["one|all|community", "two|all|extra"],
				installed: false,
			},
			{ name: "B", sources: ["one|all|community"], installed: true },
		]);
		expect(decodeAddonId(result.addons[0].detailsId)).toBe(
			"https://a.example/manifest.json",
		);
		expect(result.addons[0]).toMatchObject({
			version: null,
			description: null,
			logo: null,
			types: ["movie"],
			resources: ["stream"],
		});
	});

	it("is empty when no directory is reachable", async () => {
		const registry = {
			addonCatalogs: () => [directoryRef("one", "community")],
		} as unknown as AddonRegistry;
		const result = await addonDirectory(
			{ getAddonCatalog: async () => null },
			registry,
			[],
		);
		expect(result.addons).toEqual([]);
		expect(result.sources[0].failed).toBe(true);
	});
});
