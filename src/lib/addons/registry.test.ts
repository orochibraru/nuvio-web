import { beforeEach, describe, expect, it } from "vitest";
import {
	clearManifestCache,
	parseAddonUrl,
	validateManifest,
} from "./manifest.ts";
import {
	AddonRegistry,
	buildRegistry,
	type InstalledAddon,
	type NuvioAddonRow,
} from "./registry.ts";
import type { AddonManifest } from "./types.ts";

function manifest(over: Partial<AddonManifest> = {}): AddonManifest {
	return {
		id: "org.test",
		name: "Test",
		version: "1.0.0",
		types: ["movie", "series"],
		resources: ["catalog", "meta", "stream"],
		catalogs: [{ type: "movie", id: "top", name: "Popular" }],
		...over,
	};
}

function installed(over: Partial<InstalledAddon> = {}): InstalledAddon {
	return {
		url: "https://addon.example/manifest.json",
		name: null,
		enabled: true,
		sortOrder: 0,
		baseUrl: "https://addon.example",
		manifest: manifest(),
		...over,
	};
}

describe("parseAddonUrl", () => {
	it("strips a trailing slash and the manifest suffix", () => {
		expect(parseAddonUrl("https://a.tv/manifest.json")).toEqual({
			baseUrl: "https://a.tv",
			manifestUrl: "https://a.tv/manifest.json",
		});
		expect(parseAddonUrl("https://a.tv/lang=en/")).toEqual({
			baseUrl: "https://a.tv/lang=en",
			manifestUrl: "https://a.tv/lang=en/manifest.json",
		});
	});
});

describe("validateManifest", () => {
	it("accepts a well-formed manifest", () => {
		const result = validateManifest({
			id: "org.x",
			name: "X",
			version: "2.1.0",
			types: ["movie"],
			resources: ["catalog"],
			catalogs: [{ type: "movie", id: "a" }],
		});
		expect(result.id).toBe("org.x");
		expect(result.version).toBe("2.1.0");
		expect(result.catalogs).toHaveLength(1);
	});

	it("defaults a missing version", () => {
		expect(
			validateManifest({ id: "x", name: "X", resources: ["meta"] }).version,
		).toBe("0.0.0");
	});

	it("rejects missing id / name / resources", () => {
		expect(() => validateManifest({ name: "X", resources: ["meta"] })).toThrow(
			/id/,
		);
		expect(() => validateManifest({ id: "x", resources: ["meta"] })).toThrow(
			/name/,
		);
		expect(() =>
			validateManifest({ id: "x", name: "X", resources: [] }),
		).toThrow(/resource/);
	});

	it("normalizes object-form resources", () => {
		const result = validateManifest({
			id: "x",
			name: "X",
			resources: [{ name: "stream", types: ["series"], idPrefixes: ["tt"] }],
			catalogs: [],
		});
		expect(result.resources[0]).toMatchObject({
			name: "stream",
			types: ["series"],
		});
	});
});

describe("AddonRegistry.providersFor", () => {
	const catalogOnly = installed({
		baseUrl: "https://catalog.example",
		manifest: manifest({ id: "a", resources: ["catalog", "meta"] }),
	});
	const seriesStreams = installed({
		baseUrl: "https://series.example",
		sortOrder: 2,
		manifest: manifest({
			id: "b",
			resources: [{ name: "stream", types: ["series"], idPrefixes: ["tt"] }],
			catalogs: [],
		}),
	});
	const anyStreams = installed({
		baseUrl: "https://any.example",
		sortOrder: 1,
		manifest: manifest({ id: "c", resources: ["stream"], catalogs: [] }),
	});
	const registry = new AddonRegistry([catalogOnly, seriesStreams, anyStreams]);

	it("returns only addons that declare the resource", () => {
		const providers = registry.providersFor("stream", "series", "tt1");
		expect(providers.map((entry) => entry.manifest.id)).toEqual(["b", "c"]);
	});

	it("respects the resource type filter", () => {
		const providers = registry.providersFor("stream", "movie", "tt1");
		expect(providers.map((entry) => entry.manifest.id)).toEqual(["c"]);
	});

	it("respects idPrefixes", () => {
		expect(
			registry
				.providersFor("stream", "series", "kitsu:42")
				.map((e) => e.manifest.id),
		).toEqual(["c"]);
	});
});

describe("AddonRegistry catalogs", () => {
	const registry = new AddonRegistry([
		installed({
			manifest: manifest({
				id: "a",
				catalogs: [
					{ type: "movie", id: "top" },
					{ type: "series", id: "top" },
				],
			}),
		}),
	]);

	it("flattens every catalog with its owning addon", () => {
		expect(registry.catalogs()).toHaveLength(2);
	});

	it("finds a catalog by addon id + type + id", () => {
		expect(registry.findCatalog("a", "series", "top")?.catalog.type).toBe(
			"series",
		);
		expect(registry.findCatalog("a", "movie", "missing")).toBeUndefined();
	});
});

describe("buildRegistry", () => {
	beforeEach(() => clearManifestCache());

	// Public IP host so `safeFetch` skips DNS and the stub fetch is used.
	function row(over: Partial<NuvioAddonRow>): NuvioAddonRow {
		return {
			url: "https://93.184.216.34/manifest.json",
			name: null,
			enabled: true,
			sort_order: 0,
			...over,
		};
	}

	function stubFetch(bodyByUrl: Record<string, unknown>): typeof fetch {
		return (async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input.toString();
			const body = bodyByUrl[url];
			if (body === undefined) {
				return new Response("not found", { status: 404 });
			}
			return new Response(JSON.stringify(body), { status: 200 });
		}) as typeof fetch;
	}

	it("skips disabled rows and sorts by sort_order", async () => {
		const fetchImpl = stubFetch({
			"https://93.184.216.34/manifest.json": manifest({ id: "first" }),
			"https://198.51.100.7/manifest.json": manifest({ id: "second" }),
		});
		const { registry, errors } = await buildRegistry(
			[
				row({
					url: "https://198.51.100.7/manifest.json",
					sort_order: 5,
					name: "b",
				}),
				row({ sort_order: 1, name: "a" }),
				row({
					url: "https://203.0.113.9/manifest.json",
					enabled: false,
					name: "off",
				}),
			],
			fetchImpl,
		);
		expect(errors).toHaveLength(0);
		expect(registry.addons.map((entry) => entry.manifest.id)).toEqual([
			"first",
			"second",
		]);
	});

	it("isolates an addon that fails to load", async () => {
		const fetchImpl = stubFetch({
			"https://93.184.216.34/manifest.json": manifest({ id: "ok" }),
		});
		const { registry, errors } = await buildRegistry(
			[
				row({ name: "ok" }),
				row({ url: "https://198.51.100.7/manifest.json", name: "broken" }),
			],
			fetchImpl,
		);
		expect(registry.addons.map((entry) => entry.manifest.id)).toEqual(["ok"]);
		expect(errors).toHaveLength(1);
		expect(errors[0].url).toBe("https://198.51.100.7/manifest.json");
	});
});
