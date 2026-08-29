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

export interface AddonLoadError {
	url: string;
	message: string;
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

export async function buildRegistry(
	rows: NuvioAddonRow[],
	fetchImpl: typeof fetch,
): Promise<{ registry: AddonRegistry; errors: AddonLoadError[] }> {
	const enabled = rows
		.filter((row) => row.enabled)
		.sort((a, b) => a.sort_order - b.sort_order);

	const errors: AddonLoadError[] = [];
	const loaded = await Promise.all(
		enabled.map(async (row): Promise<InstalledAddon | null> => {
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
					message:
						error instanceof Error ? error.message : "Failed to load addon",
				});
				return null;
			}
		}),
	);

	return {
		registry: new AddonRegistry(
			loaded.filter((entry): entry is InstalledAddon => entry !== null),
		),
		errors,
	};
}
