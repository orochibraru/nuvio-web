import { httpUrlOrNull } from "#lib/core/url.js";
import type { AddonManifest, CatalogDef } from "./types.ts";

export const ALL = "all";
export const DIRECTORY_RESOURCES = [
	"catalog",
	"meta",
	"stream",
	"subtitles",
] as const;
export const DIRECTORY_TYPES = [
	"movie",
	"series",
	"anime",
	"tv",
	"channel",
] as const;

export interface DirectorySource {
	key: string;
	name: string;
	addonName: string;
	failed: boolean;
}

export interface DirectoryAddon {
	detailsId: string;
	transportUrl: string;
	name: string;
	version: string | null;
	description: string | null;
	logo: string | null;
	types: string[];
	resources: string[];
	sources: string[];
	installed: boolean;
}

export interface DirectoryFilter {
	source: string;
	resource: string;
	type: string;
	search: string;
}

function folded(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase();
}

export function filterDirectory<
	T extends Pick<
		DirectoryAddon,
		"name" | "description" | "types" | "resources" | "sources"
	>,
>(addons: readonly T[], filter: DirectoryFilter): T[] {
	const terms = folded(filter.search).split(/\s+/).filter(Boolean);
	return addons.filter((addon) => {
		if (filter.source !== ALL && !addon.sources.includes(filter.source)) {
			return false;
		}
		if (filter.resource !== ALL && !addon.resources.includes(filter.resource)) {
			return false;
		}
		if (filter.type !== ALL && !addon.types.includes(filter.type)) {
			return false;
		}
		const haystack = folded(`${addon.name} ${addon.description ?? ""}`);
		return terms.every((term) => haystack.includes(term));
	});
}

const MAX_ID_LENGTH = 4096;
const INSTALLED_PREFIX = "i-";

// An installed addon's URL often carries a debrid or API key, so its page is keyed by a hash of it, never the URL.
export function installedAddonId(url: string): string {
	let first = 0xde_ad_be_ef;
	let second = 0x41_c6_ce_57;
	for (let index = 0; index < url.length; index++) {
		const code = url.charCodeAt(index);
		first = Math.imul(first ^ code, 2_654_435_761);
		second = Math.imul(second ^ code, 1_597_334_677);
	}
	first =
		Math.imul(first ^ (first >>> 16), 2_246_822_507) ^
		Math.imul(second ^ (second >>> 13), 3_266_489_909);
	second =
		Math.imul(second ^ (second >>> 16), 2_246_822_507) ^
		Math.imul(first ^ (first >>> 13), 3_266_489_909);
	const hash = 4_294_967_296 * (2_097_151 & second) + (first >>> 0);
	return `${INSTALLED_PREFIX}${hash.toString(36)}`;
}

export function isInstalledAddonId(id: string): boolean {
	return id.startsWith(INSTALLED_PREFIX);
}

export function encodeAddonId(url: string): string {
	let binary = "";
	for (const byte of new TextEncoder().encode(url)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/[=]+$/, "");
}

export function decodeAddonId(id: string): string | null {
	if (id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) {
		return null;
	}
	try {
		const binary = atob(id.replaceAll("-", "+").replaceAll("_", "/"));
		const url = new TextDecoder("utf-8", { fatal: true }).decode(
			Uint8Array.from(binary, (char) => char.charCodeAt(0)),
		);
		return httpUrlOrNull(url);
	} catch {
		return null;
	}
}

export interface CatalogFeatures {
	search: boolean;
	genre: boolean;
	required: string[];
	extras: string[];
}

export function catalogFeatures(catalog: CatalogDef): CatalogFeatures {
	const names = [
		...new Set([
			...(catalog.extra ?? []).map((extra) => extra.name),
			...(catalog.extraSupported ?? []),
		]),
	];
	const required = [
		...new Set([
			...(catalog.extra ?? [])
				.filter((extra) => extra.isRequired)
				.map((extra) => extra.name),
			...(catalog.extraRequired ?? []),
		]),
	];
	return {
		search: names.includes("search"),
		genre: names.includes("genre") || (catalog.genres?.length ?? 0) > 0,
		required,
		extras: names.filter((name) => name !== "search" && name !== "genre"),
	};
}

export interface ResourceDetail {
	name: string;
	types: string[];
	idPrefixes: string[];
}

export function resourceDetails(manifest: AddonManifest): ResourceDetail[] {
	return manifest.resources.map((entry) =>
		typeof entry === "string"
			? {
					name: entry,
					types: manifest.types,
					idPrefixes: manifest.idPrefixes ?? [],
				}
			: {
					name: entry.name,
					types: entry.types,
					idPrefixes: entry.idPrefixes ?? manifest.idPrefixes ?? [],
				},
	);
}
