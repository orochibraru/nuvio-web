import { pooledMap } from "#lib/core/pool.js";
import { fetchManifest } from "./manifest.ts";
import type { AddonManifest, AddonResourceName, CatalogDef } from "./types.ts";

export interface InstalledAddon {
	url: string;
	name: string | null;
	enabled: boolean;
	sortOrder: number;
	baseUrl: string;
	manifest: AddonManifest;
}

export interface CatalogRef {
	addon: InstalledAddon;
	catalog: CatalogDef;
}

/**
 * Why a manifest didn't load: one of a fixed set of reasons, or the HTTP
 * status it answered. A code, not text: the registry is cached across
 * requests, so the settings page words it in the viewer's language.
 */
export type LoadFailure =
	| "timeout"
	| "invalid"
	| "blocked"
	| "unreachable"
	| number;

export interface AddonLoadError {
	url: string;
	reason: LoadFailure;
}

/**
 * What the settings page may say about a manifest that didn't load. Specific
 * enough to act on ("HTTP 404" vs "Timed out"), never the cause's own text: a
 * connection error names the host / IP / port it tried.
 */
export function loadFailure(error: unknown): LoadFailure {
	if (error instanceof DOMException && error.name === "TimeoutError") {
		return "timeout";
	}
	if (error instanceof SyntaxError) {
		return "invalid";
	}
	const message = error instanceof Error ? error.message : "";
	// `fetchManifest`'s non-2xx error.
	const http = message.match(/^Manifest request failed with (\d{3})$/);
	if (http) {
		return Number(http[1]);
	}
	// `validateManifest`'s errors.
	if (message.startsWith("Manifest ")) {
		return "invalid";
	}
	// `safeFetch`'s SSRF guard.
	if (message === "URL resolves to a disallowed address") {
		return "blocked";
	}
	return "unreachable";
}

/** A Nuvio addon row (`client.addons.list()` result / `AddonInput`). */
export interface NuvioAddonRow {
	url: string;
	name: string | null;
	enabled: boolean;
	sort_order: number;
}

function addonServes(
	manifest: AddonManifest,
	resource: AddonResourceName,
	type: string,
	id: string,
): boolean {
	const match = manifest.resources.find((entry) =>
		typeof entry === "string" ? entry === resource : entry.name === resource,
	);
	if (!match) {
		return false;
	}

	const types = typeof match === "string" ? manifest.types : match.types;
	const idPrefixes =
		typeof match === "string"
			? manifest.idPrefixes
			: (match.idPrefixes ?? manifest.idPrefixes);

	if (types.length > 0 && !types.includes(type)) {
		return false;
	}
	if (
		idPrefixes &&
		idPrefixes.length > 0 &&
		!idPrefixes.some((prefix) => id.startsWith(prefix))
	) {
		return false;
	}
	return true;
}

export class AddonRegistry {
	constructor(readonly addons: InstalledAddon[]) {}

	get isEmpty(): boolean {
		return this.addons.length === 0;
	}

	catalogs(): CatalogRef[] {
		return this.addons.flatMap((addon) =>
			addon.manifest.catalogs.map((catalog) => ({ addon, catalog })),
		);
	}

	findCatalog(
		addonId: string,
		type: string,
		catalogId: string,
	): CatalogRef | undefined {
		const addon = this.addons.find((entry) => entry.manifest.id === addonId);
		const catalog = addon?.manifest.catalogs.find(
			(entry) => entry.type === type && entry.id === catalogId,
		);
		return addon && catalog ? { addon, catalog } : undefined;
	}

	/** `addon_catalog` catalogs : addons that advertise other addons. */
	addonCatalogs(): CatalogRef[] {
		return this.addons.flatMap((addon) =>
			(addon.manifest.addonCatalogs ?? []).map((catalog) => ({
				addon,
				catalog,
			})),
		);
	}

	findAddonCatalog(
		addonId: string,
		type: string,
		catalogId: string,
	): CatalogRef | undefined {
		const addon = this.addons.find((entry) => entry.manifest.id === addonId);
		const catalog = addon?.manifest.addonCatalogs?.find(
			(entry) => entry.type === type && entry.id === catalogId,
		);
		return addon && catalog ? { addon, catalog } : undefined;
	}

	/** Addons that serve `resource` for this `type`/`id`, in profile sort order. */
	providersFor(
		resource: AddonResourceName,
		type: string,
		id: string,
	): InstalledAddon[] {
		return this.addons.filter((addon) =>
			addonServes(addon.manifest, resource, type, id),
		);
	}
}

// Same cap as the resource fan-out in `client.ts`: a profile with a dozen
// addons must not open a dozen manifest requests at once.
const MANIFEST_CONCURRENCY = 6;

export async function buildRegistry(
	rows: NuvioAddonRow[],
	fetchImpl: typeof fetch,
): Promise<{ registry: AddonRegistry; errors: AddonLoadError[] }> {
	const enabled = rows
		.filter((row) => row.enabled)
		.sort((a, b) => a.sort_order - b.sort_order);

	const errors: AddonLoadError[] = [];
	const loaded = await pooledMap(
		enabled,
		MANIFEST_CONCURRENCY,
		async (row): Promise<InstalledAddon | null> => {
			try {
				const { manifest, baseUrl } = await fetchManifest(row.url, fetchImpl);
				return {
					url: row.url,
					name: row.name,
					enabled: row.enabled,
					sortOrder: row.sort_order,
					baseUrl,
					manifest,
				};
			} catch (error) {
				errors.push({
					url: row.url,
					reason: loadFailure(error),
				});
				return null;
			}
		},
	);

	return {
		registry: new AddonRegistry(
			loaded.filter((entry): entry is InstalledAddon => entry !== null),
		),
		errors,
	};
}
