import { TtlCache } from "./cache.ts";
import type {
	AddonManifest,
	AddonResourceName,
	AddonResourceObject,
} from "./types.ts";

const MANIFEST_TTL_MS = 30 * 60 * 1000;
const manifestCache = new TtlCache<AddonManifest>(MANIFEST_TTL_MS);

const RESOURCE_NAMES: AddonResourceName[] = [
	"catalog",
	"meta",
	"stream",
	"subtitles",
	"addon_catalog",
];

export interface ParsedAddonUrl {
	/** Base for resource requests, e.g. `https://addon.tv/lang=en` (no trailing slash, no `/manifest.json`). */
	baseUrl: string;
	manifestUrl: string;
}

export function parseAddonUrl(raw: string): ParsedAddonUrl {
	let url = raw.trim().replace(/\/+$/, "");
	if (url.endsWith("/manifest.json")) {
		url = url.slice(0, -"/manifest.json".length);
	}
	return { baseUrl: url, manifestUrl: `${url}/manifest.json` };
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function normalizeResources(
	value: unknown,
): Array<AddonResourceName | AddonResourceObject> {
	if (!Array.isArray(value)) return [];
	const out: Array<AddonResourceName | AddonResourceObject> = [];
	for (const entry of value) {
		if (
			typeof entry === "string" &&
			RESOURCE_NAMES.includes(entry as AddonResourceName)
		) {
			out.push(entry as AddonResourceName);
		} else if (entry && typeof entry === "object" && "name" in entry) {
			const record = entry as Record<string, unknown>;
			if (RESOURCE_NAMES.includes(record.name as AddonResourceName)) {
				out.push({
					name: record.name as AddonResourceName,
					types: asStringArray(record.types),
					idPrefixes: Array.isArray(record.idPrefixes)
						? asStringArray(record.idPrefixes)
						: undefined,
				});
			}
		}
	}
	return out;
}

export function validateManifest(data: unknown): AddonManifest {
	if (!data || typeof data !== "object") {
		throw new Error("Manifest is not a JSON object");
	}
	const record = data as Record<string, unknown>;
	const id = asString(record.id);
	const name = asString(record.name);
	if (!id) throw new Error("Manifest is missing `id`");
	if (!name) throw new Error("Manifest is missing `name`");

	const resources = normalizeResources(record.resources);
	if (resources.length === 0) {
		throw new Error("Manifest declares no usable resources");
	}

	return {
		id,
		name,
		version: asString(record.version) ?? "0.0.0",
		description: asString(record.description),
		logo: asString(record.logo),
		background: asString(record.background),
		contactEmail: asString(record.contactEmail),
		types: asStringArray(record.types),
		idPrefixes: Array.isArray(record.idPrefixes)
			? asStringArray(record.idPrefixes)
			: undefined,
		resources,
		catalogs: Array.isArray(record.catalogs)
			? (record.catalogs as AddonManifest["catalogs"])
			: [],
		addonCatalogs: Array.isArray(record.addonCatalogs)
			? (record.addonCatalogs as AddonManifest["catalogs"])
			: undefined,
		behaviorHints:
			record.behaviorHints && typeof record.behaviorHints === "object"
				? (record.behaviorHints as AddonManifest["behaviorHints"])
				: undefined,
	};
}

export interface FetchedManifest {
	manifest: AddonManifest;
	baseUrl: string;
}

export async function fetchManifest(
	rawUrl: string,
	fetchImpl: typeof fetch,
	{
		timeoutMs = 10_000,
		force = false,
	}: { timeoutMs?: number; force?: boolean } = {},
): Promise<FetchedManifest> {
	const { baseUrl, manifestUrl } = parseAddonUrl(rawUrl);

	if (!force) {
		const cached = manifestCache.get(baseUrl);
		if (cached) return { manifest: cached, baseUrl };
	}

	const response = await fetchImpl(manifestUrl, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) {
		throw new Error(`Manifest request failed with ${response.status}`);
	}
	const manifest = validateManifest(await response.json());
	manifestCache.set(baseUrl, manifest);
	return { manifest, baseUrl };
}

export function clearManifestCache(): void {
	manifestCache.clear();
}
