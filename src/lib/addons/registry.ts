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
	/** `AddonRegistry.idOf(addon)`: unique per install, unlike the manifest id. */
	addonId: string;
	catalog: CatalogDef;
}

// Stremio's own community addon directory, offered next to any installed one.
const COMMUNITY_DIRECTORY: InstalledAddon = {
	url: "https://v3-cinemeta.strem.io/manifest.json",
	name: "Cinemeta",
	enabled: true,
	sortOrder: 0,
	baseUrl: "https://v3-cinemeta.strem.io",
	manifest: {
		id: "com.linvo.cinemeta",
		name: "Cinemeta",
		version: "0.0.0",
		types: [],
		resources: ["addon_catalog"],
		catalogs: [],
		addonCatalogs: [{ type: "all", id: "community", name: "Community" }],
	},
};

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
	// `fetchManifest`'s and `AddonClient`'s non-2xx errors.
	const http = message.match(/ request failed with (\d{3})$/);
	if (http) {
		return Number(http[1]);
	}
	// `validateManifest`'s errors, and `readJsonCapped`'s size cap.
	if (message.startsWith("Manifest ") || message === "Response too large") {
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
	return manifest.resources.some(
		(entry) =>
			(typeof entry === "string" ? entry : entry.name) === resource &&
			entryServes(manifest, entry, type, id),
	);
}

function entryServes(
	manifest: AddonManifest,
	match: AddonManifest["resources"][number],
	type: string,
	id: string,
): boolean {
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
	private readonly ids = new Map<InstalledAddon, string>();

	constructor(readonly addons: InstalledAddon[]) {
		const installs = new Map<string, number>();
		for (const addon of addons) {
			const count = (installs.get(addon.manifest.id) ?? 0) + 1;
			installs.set(addon.manifest.id, count);
			this.ids.set(
				addon,
				count === 1 ? addon.manifest.id : `${addon.manifest.id}~${count}`,
			);
		}
	}

	get isEmpty(): boolean {
		return this.addons.length === 0;
	}

	/** The manifest id, suffixed for a second install of the same addon (another config). */
	idOf(addon: InstalledAddon): string {
		return this.ids.get(addon) ?? addon.manifest.id;
	}

	catalogs(): CatalogRef[] {
		return this.addons.flatMap((addon) =>
			addon.manifest.catalogs.map((catalog) => ({
				addon,
				addonId: this.idOf(addon),
				catalog,
			})),
		);
	}

	findCatalog(
		addonId: string,
		type: string,
		catalogId: string,
	): CatalogRef | undefined {
		return this.catalogs().find(
			(ref) =>
				ref.addonId === addonId &&
				ref.catalog.type === type &&
				ref.catalog.id === catalogId,
		);
	}

	/** `addon_catalog` catalogs (addons that advertise other addons), then Stremio's community one. */
	addonCatalogs(): CatalogRef[] {
		const installed = this.addons.flatMap((addon) =>
			(addon.manifest.addonCatalogs ?? []).map((catalog) => ({
				addon,
				addonId: this.idOf(addon),
				catalog,
			})),
		);
		const community = (COMMUNITY_DIRECTORY.manifest.addonCatalogs ?? [])
			.map((catalog) => ({
				addon: COMMUNITY_DIRECTORY,
				addonId: COMMUNITY_DIRECTORY.manifest.id,
				catalog,
			}))
			.filter(
				(ref) =>
					!installed.some(
						(other) =>
							other.addonId === ref.addonId &&
							other.catalog.type === ref.catalog.type &&
							other.catalog.id === ref.catalog.id,
					),
			);
		return [...installed, ...community];
	}

	findAddonCatalog(
		addonId: string,
		type: string,
		catalogId: string,
	): CatalogRef | undefined {
		return this.addonCatalogs().find(
			(ref) =>
				ref.addonId === addonId &&
				ref.catalog.type === type &&
				ref.catalog.id === catalogId,
		);
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
