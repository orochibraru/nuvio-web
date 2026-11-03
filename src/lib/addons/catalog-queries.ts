import { pooledMap } from "#lib/core/pool.js";
import {
	EMPTY_HOME_LAYOUT,
	type HomeLayout,
	homeCatalogs,
} from "#lib/settings/home-layout.js";
import type { AddonCatalogEntry } from "./client.ts";
import {
	type DirectoryAddon,
	type DirectorySource,
	encodeAddonId,
} from "./directory.ts";
import { parseAddonUrl } from "./manifest.ts";
import type { AddonRegistry } from "./registry.ts";
import type { Meta, MetaPreview } from "./types.ts";

// Home shows up to 8 catalogs (16 once the user arranged them); fetching them
// all at once is a burst at whichever addons serve them, so a few at a time.
const CATALOG_CONCURRENCY = 4;

/**
 * Just the bits of `AddonClient` these need, so the orchestration below can
 * be exercised against a fake : the wrappers in `server.ts` pass the real
 * client, and nothing here reaches for a request context.
 */
export interface CatalogSource {
	getCatalog: (
		query: {
			type: string;
			id: string;
			genre?: string;
			skip?: number;
			search?: string;
		},
		addonId?: string,
	) => Promise<{
		metas: MetaPreview[];
		from: { addonId: string; addon: { manifest: { name: string } } };
	} | null>;
	getMeta: (
		type: string,
		id: string,
	) => Promise<{ meta: Meta; addon: { manifest: { name: string } } } | null>;
}

export interface HomeRow {
	addonId: string;
	addonName: string;
	type: string;
	id: string;
	title: string;
	metas: MetaPreview[];
}

export interface CatalogSelector {
	addonId?: string;
	type: string;
	id: string;
	genre?: string;
	skip?: number;
	search?: string;
}

function catalogSupports(
	catalog: { extraSupported?: string[]; extra?: Array<{ name: string }> },
	key: string,
): boolean {
	return (
		catalog.extraSupported ??
		catalog.extra?.map((entry) => entry.name) ??
		[]
	).includes(key);
}

/**
 * The home feed's catalog rows. Rows that error or come back empty are
 * dropped. Pooled so a many-catalog profile doesn't burst every addon at once.
 */
/**
 * The home screen's catalog rows. `layout` is the profile's arrangement from
 * Settings → Home (order, hidden catalogs); without one, the first eight
 * catalogs in addon order, as before there was an editor.
 */
export async function homeCatalogRows(
	client: CatalogSource,
	registry: AddonRegistry,
	layout: HomeLayout = EMPTY_HOME_LAYOUT,
): Promise<HomeRow[]> {
	const browsable = registry
		.catalogs()
		.filter(({ catalog }) => !catalog.extraRequired?.length);
	const catalogs = homeCatalogs(
		browsable.map((ref) => ({
			ref,
			addonId: ref.addonId,
			type: ref.catalog.type,
			id: ref.catalog.id,
		})),
		layout,
	).map((entry) => entry.ref);

	const rows = await pooledMap(catalogs, CATALOG_CONCURRENCY, async (ref) => {
		try {
			const result = await client.getCatalog(
				{ type: ref.catalog.type, id: ref.catalog.id },
				ref.addonId,
			);
			return {
				addonId: ref.addonId,
				addonName: ref.addon.manifest.name,
				type: ref.catalog.type,
				id: ref.catalog.id,
				title: ref.catalog.name ?? ref.addon.manifest.name,
				metas: (result?.metas ?? []).slice(0, 20),
			};
		} catch {
			return null;
		}
	});

	return rows.filter(
		(row): row is HomeRow => row != null && row.metas.length > 0,
	);
}

/** Search every catalog that advertises `search`, de-duped by `type:id`. */
export async function searchAllCatalogs(
	client: CatalogSource,
	registry: AddonRegistry,
	term: string,
): Promise<{ metas: MetaPreview[] }> {
	const searchable = registry
		.catalogs()
		.filter(({ catalog }) => catalogSupports(catalog, "search"));

	const batches = await pooledMap(
		searchable,
		CATALOG_CONCURRENCY,
		async ({ addonId, catalog }) => {
			try {
				const result = await client.getCatalog(
					{ type: catalog.type, id: catalog.id, search: term },
					addonId,
				);
				return result?.metas ?? [];
			} catch {
				return [];
			}
		},
	);

	const seen = new Set<string>();
	const metas: MetaPreview[] = [];
	for (const meta of batches.flat()) {
		const key = `${meta.type}:${meta.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			metas.push(meta);
		}
	}
	return { metas };
}

/**
 * "More like this" : no catalog / meta provider exposes a real similar list,
 * so approximate it: the biggest catalogs of the right type, filtered to a
 * shared genre, minus the title itself. Probes genre-major, then catalog
 * order, and takes the first that yields enough titles.
 */
export async function similarToTitle(
	client: CatalogSource,
	registry: AddonRegistry,
	seed: { type: string; id: string; genres: string[] },
): Promise<{ metas: MetaPreview[] }> {
	const { type, id, genres } = seed;
	const candidates = registry
		.catalogs()
		.filter(
			({ catalog }) => catalog.type === type && !catalog.extraRequired?.length,
		)
		.slice(0, 6);
	if (candidates.length === 0) {
		return { metas: [] };
	}
	const wanted = genres.slice(0, 2);
	const probes = (wanted.length > 0 ? wanted : [undefined]).flatMap((genre) =>
		candidates.map(({ addonId, catalog }) => ({ genre, addonId, catalog })),
	);
	const results = await pooledMap(
		probes,
		CATALOG_CONCURRENCY,
		async ({ genre, addonId, catalog }) => {
			try {
				return await client.getCatalog(
					{ type: catalog.type, id: catalog.id, genre },
					addonId,
				);
			} catch {
				return null;
			}
		},
	);
	for (const result of results) {
		const metas = (result?.metas ?? [])
			.filter((meta) => meta.id !== id)
			.slice(0, 20);
		if (metas.length >= 6) {
			return { metas };
		}
	}
	return { metas: [] };
}

/** One page of a catalog's contents; `null` when no addon serves it. */
export async function catalogPage(
	client: CatalogSource,
	selector: CatalogSelector,
): Promise<{
	metas: MetaPreview[];
	addon: { id: string; name: string };
} | null> {
	const result = await client.getCatalog(
		{
			type: selector.type,
			id: selector.id,
			genre: selector.genre,
			skip: selector.skip,
			search: selector.search,
		},
		selector.addonId,
	);
	if (!result) {
		return null;
	}
	return {
		metas: result.metas,
		addon: {
			id: result.from.addonId,
			name: result.from.addon.manifest.name,
		},
	};
}

/** One title's metadata, or `null` when no installed addon has any. */
export async function titleMeta(
	client: CatalogSource,
	type: string,
	id: string,
): Promise<{ meta: Meta; addonName: string } | null> {
	const result = await client.getMeta(type, id);
	return result
		? { meta: result.meta, addonName: result.addon.manifest.name }
		: null;
}

const DIRECTORY_CONCURRENCY = 4;

export interface DirectoryClient {
	getAddonCatalog: (
		addonId: string,
		type: string,
		id: string,
	) => Promise<{ addons: AddonCatalogEntry[] } | null>;
}

/** Every addon the profile's addon catalogs list, one entry per transport URL. */
export async function addonDirectory(
	client: DirectoryClient,
	registry: Pick<AddonRegistry, "addonCatalogs">,
	installedUrls: string[],
): Promise<{ sources: DirectorySource[]; addons: DirectoryAddon[] }> {
	const installed = new Set(
		installedUrls.map((url) => parseAddonUrl(url).baseUrl),
	);
	const listings = await pooledMap(
		registry.addonCatalogs(),
		DIRECTORY_CONCURRENCY,
		async ({ addon, addonId, catalog }) => {
			const result = await client
				.getAddonCatalog(addonId, catalog.type, catalog.id)
				.catch(() => null);
			return {
				source: {
					key: `${addonId}|${catalog.type}|${catalog.id}`,
					name: catalog.name ?? addon.manifest.name,
					addonName: addon.manifest.name,
					failed: result === null,
				},
				entries: result?.addons ?? [],
			};
		},
	);

	const byUrl = new Map<string, DirectoryAddon>();
	for (const { source, entries } of listings) {
		for (const { transportUrl, manifest } of entries) {
			const baseUrl = parseAddonUrl(transportUrl).baseUrl;
			const existing = byUrl.get(baseUrl);
			if (existing) {
				if (!existing.sources.includes(source.key)) {
					existing.sources.push(source.key);
				}
				continue;
			}
			byUrl.set(baseUrl, {
				detailsId: encodeAddonId(transportUrl),
				transportUrl,
				name: manifest.name,
				version: manifest.version ?? null,
				description: manifest.description ?? null,
				logo: manifest.logo ?? null,
				types: manifest.types,
				resources: manifest.resources,
				sources: [source.key],
				installed: installed.has(baseUrl),
			});
		}
	}
	return {
		sources: listings.map(({ source }) => source),
		addons: [...byUrl.values()],
	};
}
