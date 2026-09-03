import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearManifestCache,
	fetchManifest,
	validateManifest,
} from "./manifest.ts";

// `parseAddonUrl` / the basic `validateManifest` rejections are covered in
// `registry.test.ts` alongside `buildRegistry`; this file takes the shape
// normalizers an addon's manifest is put through.

describe("validateManifest normalizers", () => {
	it("keeps a resource object with its types and id prefixes", () => {
		const result = validateManifest({
			id: "x",
			name: "X",
			resources: [
				"meta",
				"not-a-resource",
				{ name: "stream", types: ["series", 7], idPrefixes: ["tt", 9] },
				{ name: "bogus", types: [] },
				{ types: ["movie"] },
				null,
			],
		});

		expect(result.resources).toEqual([
			"meta",
			{ name: "stream", types: ["series"], idPrefixes: ["tt"] },
		]);
	});

	it("leaves idPrefixes undefined when the resource omits them", () => {
		const result = validateManifest({
			id: "x",
			name: "X",
			resources: [{ name: "catalog", types: ["movie"] }],
		});
		expect(result.resources[0]).toEqual({
			name: "catalog",
			types: ["movie"],
			idPrefixes: undefined,
		});
	});

	it("treats a non-array resources field as none at all", () => {
		expect(() =>
			validateManifest({ id: "x", name: "X", resources: "catalog" }),
		).toThrow(/no usable resources/);
	});

	it("normalizes catalog extras, dropping unnamed entries", () => {
		const [catalog] = validateManifest({
			id: "x",
			name: "X",
			resources: ["catalog"],
			catalogs: [
				{
					type: "movie",
					id: "top",
					extra: [
						{ name: "genre", options: ["Drama", 7], optionsLimit: 1 },
						{ name: "", options: [] },
						{ isRequired: true },
						null,
						"nope",
					],
				},
			],
		}).catalogs;

		expect(catalog.extra).toEqual([
			{
				name: "genre",
				isRequired: false,
				options: ["Drama"],
				optionsLimit: 1,
			},
		]);
	});

	it("leaves extra undefined when it is not an array", () => {
		const [catalog] = validateManifest({
			id: "x",
			name: "X",
			resources: ["catalog"],
			catalogs: [{ type: "movie", id: "top", extra: "genre" }],
		}).catalogs;
		expect(catalog.extra).toBeUndefined();
	});

	it("skips catalogs missing a type or an id", () => {
		expect(
			validateManifest({
				id: "x",
				name: "X",
				resources: ["catalog"],
				catalogs: [
					{ type: "movie" },
					{ id: "top" },
					null,
					"nope",
					{ type: "movie", id: "top" },
				],
			}).catalogs,
		).toHaveLength(1);
	});

	it("treats a non-array catalogs field as empty", () => {
		expect(
			validateManifest({
				id: "x",
				name: "X",
				resources: ["catalog"],
				catalogs: { type: "movie" },
			}).catalogs,
		).toEqual([]);
	});

	it("normalizes behaviorHints to strict booleans", () => {
		expect(
			validateManifest({
				id: "x",
				name: "X",
				resources: ["meta"],
				behaviorHints: { adult: true, p2p: "yes", configurable: 1 },
			}).behaviorHints,
		).toEqual({
			adult: true,
			p2p: false,
			configurable: false,
			configurationRequired: false,
		});
	});

	it("leaves behaviorHints undefined when absent or not an object", () => {
		expect(
			validateManifest({ id: "x", name: "X", resources: ["meta"] })
				.behaviorHints,
		).toBeUndefined();
		expect(
			validateManifest({
				id: "x",
				name: "X",
				resources: ["meta"],
				behaviorHints: "none",
			}).behaviorHints,
		).toBeUndefined();
	});

	it("carries idPrefixes, addonCatalogs and the optional strings", () => {
		const result = validateManifest({
			id: "x",
			name: "X",
			resources: ["addon_catalog"],
			idPrefixes: ["tt", 4],
			addonCatalogs: [{ type: "all", id: "community" }],
			description: "D",
			logo: "L",
			background: "B",
			contactEmail: "e@example.com",
			types: ["movie", 3],
		});

		expect(result.idPrefixes).toEqual(["tt"]);
		expect(result.addonCatalogs).toHaveLength(1);
		expect(result.types).toEqual(["movie"]);
		expect(result).toMatchObject({
			description: "D",
			logo: "L",
			background: "B",
			contactEmail: "e@example.com",
		});
	});

	it("leaves idPrefixes and addonCatalogs undefined when not arrays", () => {
		const result = validateManifest({
			id: "x",
			name: "X",
			resources: ["meta"],
			idPrefixes: "tt",
			addonCatalogs: "all",
		});
		expect(result.idPrefixes).toBeUndefined();
		expect(result.addonCatalogs).toBeUndefined();
	});
});

describe("fetchManifest", () => {
	// A public literal host so `safeFetch` skips DNS and reaches the stub.
	const url = "https://93.184.216.34/manifest.json";
	const body = {
		id: "org.one",
		name: "One",
		version: "1.0.0",
		resources: ["catalog"],
		catalogs: [{ type: "movie", id: "top" }],
	};

	beforeEach(() => clearManifestCache());

	it("fetches, validates and caches by base URL", async () => {
		const impl = vi.fn(
			async () => new Response(JSON.stringify(body), { status: 200 }),
		) as unknown as typeof fetch;

		const first = await fetchManifest(url, impl);
		expect(first).toEqual({
			manifest: expect.objectContaining({ id: "org.one" }),
			baseUrl: "https://93.184.216.34",
		});

		await fetchManifest(url, impl);
		expect(impl).toHaveBeenCalledTimes(1);
	});

	it("re-fetches when forced", async () => {
		const impl = vi.fn(
			async () => new Response(JSON.stringify(body), { status: 200 }),
		) as unknown as typeof fetch;

		await fetchManifest(url, impl);
		await fetchManifest(url, impl, { force: true });
		expect(impl).toHaveBeenCalledTimes(2);
	});

	it("reports the status when the manifest request fails", async () => {
		const impl = vi.fn(
			async () => new Response("nope", { status: 502 }),
		) as unknown as typeof fetch;

		await expect(fetchManifest(url, impl)).rejects.toThrow(/502/);
	});
});
