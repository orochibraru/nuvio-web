import { describe, expect, it } from "vitest";
import {
	ALL,
	catalogFeatures,
	decodeAddonId,
	encodeAddonId,
	filterDirectory,
	installedAddonId,
	isInstalledAddonId,
	resourceDetails,
} from "./directory.ts";
import type { AddonManifest } from "./types.ts";

const addons = [
	{
		name: "Cinemeta",
		description: "Métadonnées officielles",
		types: ["movie", "series"],
		resources: ["catalog", "meta"],
		sources: ["a"],
	},
	{
		name: "OpenSubtitles",
		description: "Subtitles in many languages",
		types: ["movie", "series"],
		resources: ["subtitles"],
		sources: ["a", "b"],
	},
	{
		name: "Kitsu",
		description: null,
		types: ["anime"],
		resources: ["catalog", "meta"],
		sources: ["b"],
	},
];

const none = { source: ALL, resource: ALL, type: ALL, search: "" };

describe("filterDirectory", () => {
	it("keeps everything with no filter", () => {
		expect(filterDirectory(addons, none)).toEqual(addons);
	});

	it("filters by source, resource and type together", () => {
		expect(
			filterDirectory(addons, { ...none, source: "b" }).map(
				(addon) => addon.name,
			),
		).toEqual(["OpenSubtitles", "Kitsu"]);
		expect(
			filterDirectory(addons, { ...none, source: "b", resource: "meta" }).map(
				(addon) => addon.name,
			),
		).toEqual(["Kitsu"]);
		expect(filterDirectory(addons, { ...none, type: "channel" })).toEqual([]);
	});

	it("searches name and description, every word, ignoring case and accents", () => {
		const names = (search: string) =>
			filterDirectory(addons, { ...none, search }).map((addon) => addon.name);
		expect(names("  KITSU ")).toEqual(["Kitsu"]);
		expect(names("metadonnees")).toEqual(["Cinemeta"]);
		expect(names("subtitles languages")).toEqual(["OpenSubtitles"]);
		expect(names("subtitles anime")).toEqual([]);
	});
});

describe("encodeAddonId / decodeAddonId", () => {
	it("round-trips a URL through a path-safe id", () => {
		const url =
			"https://addon.example/configured%7B%22key%22%3A1%7D/é/manifest.json?a=b+c";
		const id = encodeAddonId(url);
		expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeAddonId(id)).toBe(url);
	});

	it("refuses anything that is not an http(s) URL", () => {
		expect(decodeAddonId(encodeAddonId("javascript:alert(1)"))).toBeNull();
		expect(decodeAddonId(encodeAddonId("not a url"))).toBeNull();
		expect(decodeAddonId("not/base64")).toBeNull();
		expect(decodeAddonId("a")).toBeNull();
		expect(decodeAddonId("A".repeat(5000))).toBeNull();
		expect(decodeAddonId(encodeAddonId("ÿ").slice(0, 2))).toBeNull();
	});
});

describe("installedAddonId", () => {
	const url = "https://torrentio.example/debrid=SECRETKEY123/manifest.json";

	it("is stable and recognisable, and never carries the URL", () => {
		const id = installedAddonId(url);
		expect(installedAddonId(url)).toBe(id);
		expect(isInstalledAddonId(id)).toBe(true);
		expect(id).not.toContain("SECRETKEY123");
		expect(decodeAddonId(id)).toBeNull();
	});

	it("differs between two configurations of one addon", () => {
		expect(installedAddonId(url)).not.toBe(
			installedAddonId(url.replace("SECRETKEY123", "OTHERKEY456")),
		);
	});

	it("never collides with an encoded directory URL", () => {
		expect(isInstalledAddonId(encodeAddonId(url))).toBe(false);
	});
});

describe("catalogFeatures", () => {
	it("reads search, genre and other extras from both manifest forms", () => {
		expect(
			catalogFeatures({
				type: "movie",
				id: "top",
				extra: [
					{ name: "search", isRequired: true },
					{ name: "genre" },
					{ name: "skip" },
				],
				extraSupported: ["skip"],
			}),
		).toEqual({
			search: true,
			genre: true,
			required: ["search"],
			extras: ["skip"],
		});
		expect(
			catalogFeatures({
				type: "movie",
				id: "legacy",
				genres: ["Drama"],
				extraRequired: ["skip"],
			}),
		).toEqual({ search: false, genre: true, required: ["skip"], extras: [] });
	});
});

describe("resourceDetails", () => {
	it("falls back to the manifest's types and id prefixes for a bare name", () => {
		const manifest: AddonManifest = {
			id: "a",
			name: "A",
			version: "1.0.0",
			types: ["movie"],
			idPrefixes: ["tt"],
			resources: [
				"catalog",
				{ name: "stream", types: ["series"], idPrefixes: ["kitsu:"] },
				{ name: "meta", types: [] },
			],
			catalogs: [],
		};
		expect(resourceDetails(manifest)).toEqual([
			{ name: "catalog", types: ["movie"], idPrefixes: ["tt"] },
			{ name: "stream", types: ["series"], idPrefixes: ["kitsu:"] },
			{ name: "meta", types: [], idPrefixes: ["tt"] },
		]);
	});
});
