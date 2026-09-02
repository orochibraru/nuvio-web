import { pooledMap } from "#lib/pool.js";
import type { AddonRegistry } from "./registry.ts";
import type { Meta, MetaPreview } from "./types.ts";

// Home shows up to 8 catalogs; fetching all of them at once is a burst at
// whichever addons serve them, so pull them a few at a time.
const CATALOG_CONCURRENCY = 4;

/**
 * Just the bits of `AddonClient` these need, so the orchestration below can
 * be exercised against a fake — the wrappers in `server.ts` pass the real
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
		from: { addon: { manifest: { id: string; name: string } } };
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
export async function homeCatalogRows(
	client: CatalogSource,
	registry: AddonRegistry,
): Promise<HomeRow[]> {
	const catalogs = registry
		.catalogs()
		.filter(({ catalog }) => !catalog.extraRequired?.length)
		.slice(0, 8);

	const rows = await pooledMap(catalogs, CATALOG_CONCURRENCY, async (ref) => {
		try {
			const result = await client.getCatalog(
				{ type: ref.catalog.type, id: ref.catalog.id },
				ref.addon.manifest.id,
			);
			return {
				addonId: ref.addon.manifest.id,
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
		async ({ addon, catalog }) => {
			try {
				const result = await client.getCatalog(
					{ type: catalog.type, id: catalog.id, search: term },
					addon.manifest.id,
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
 * "More like this" — no catalog / meta provider exposes a real similar list,
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
		candidates.map(({ addon, catalog }) => ({ genre, addon, catalog })),
	);
	const results = await pooledMap(
		probes,
		CATALOG_CONCURRENCY,
		async ({ genre, addon, catalog }) => {
			try {
				return await client.getCatalog(
					{ type: catalog.type, id: catalog.id, genre },
					addon.manifest.id,
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
			id: result.from.addon.manifest.id,
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
