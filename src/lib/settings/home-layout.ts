import * as v from "valibot";
import { m } from "#lib/i18n/index.js";

/**
 * Which addon catalogs the home screen shows, and in what order.
 *
 * Stored in Nuvio's home catalog settings under this client's own platform
 * (`web`). The spec documents that blob as "application-defined JSON" keyed by
 * platform, with `rows` and `hidden_catalogs` as the only shape it shows, so
 * the web client keeps those two keys and defines their contents:
 *
 * - `rows` : catalog keys in the order the user arranged them;
 * - `hidden_catalogs` : catalog keys the user turned off.
 *
 * A catalog in neither list (an addon installed after the layout was saved)
 * appears after the arranged ones, in addon order, visible : a new addon should
 * show up on Home without a trip to Settings.
 */

/** Enough of a catalog to key it, whatever else the caller carries. */
export interface CatalogRef {
	addonId: string;
	type: string;
	id: string;
}

export const homeLayoutSchema = v.object({
	rows: v.fallback(v.array(v.string()), []),
	hidden_catalogs: v.fallback(v.array(v.string()), []),
});

export type HomeLayout = v.InferOutput<typeof homeLayoutSchema>;

export const EMPTY_HOME_LAYOUT: HomeLayout = { rows: [], hidden_catalogs: [] };

/** Rows shown with no layout saved : the historical home, first eight catalogs. */
export const DEFAULT_HOME_ROWS = 8;

/** Rows shown when the user arranged them. More, since they chose each one. */
export const ARRANGED_HOME_ROWS = 16;

/** Stable identity for a catalog across sessions. `|` never occurs in an addon id. */
export function catalogKey(ref: CatalogRef): string {
	return `${ref.addonId}|${ref.type}|${ref.id}`;
}

/** A stored blob, whatever shape it arrived in, as a layout. */
export function parseHomeLayout(raw: unknown): HomeLayout {
	return v.parse(homeLayoutSchema, raw && typeof raw === "object" ? raw : {});
}

export function isCustomized(layout: HomeLayout): boolean {
	return layout.rows.length > 0 || layout.hidden_catalogs.length > 0;
}

/**
 * Every catalog, in display order: the arranged ones first, in their saved
 * order, then any the layout does not know about, in the order given. Keys in
 * the layout for catalogs that no longer exist are ignored.
 */
export function orderCatalogs<T extends CatalogRef>(
	catalogs: readonly T[],
	layout: HomeLayout,
): T[] {
	const byKey = new Map(
		catalogs.map((catalog) => [catalogKey(catalog), catalog]),
	);
	const arranged = layout.rows
		.map((key) => byKey.get(key))
		.filter((catalog): catalog is T => catalog !== undefined);
	const placed = new Set(arranged.map(catalogKey));
	return [...arranged, ...catalogs.filter((c) => !placed.has(catalogKey(c)))];
}

/** The catalogs Home shows, in order, capped. */
export function homeCatalogs<T extends CatalogRef>(
	catalogs: readonly T[],
	layout: HomeLayout,
): T[] {
	const hidden = new Set(layout.hidden_catalogs);
	const limit = isCustomized(layout) ? ARRANGED_HOME_ROWS : DEFAULT_HOME_ROWS;
	return orderCatalogs(catalogs, layout)
		.filter((catalog) => !hidden.has(catalogKey(catalog)))
		.slice(0, limit);
}

/**
 * Moves one catalog by `delta` places in the full order and returns the layout
 * that pins that order. Every current catalog is written into `rows`, so the
 * order survives a later addon reinstall shuffling the default.
 */
export function moveCatalog(
	catalogs: readonly CatalogRef[],
	layout: HomeLayout,
	key: string,
	delta: number,
): HomeLayout {
	const keys = orderCatalogs(catalogs, layout).map(catalogKey);
	const from = keys.indexOf(key);
	if (from < 0) {
		return layout;
	}
	const to = Math.max(0, Math.min(keys.length - 1, from + delta));
	const [moved] = keys.splice(from, 1);
	keys.splice(to, 0, moved);
	return { ...layout, rows: keys };
}

export function setHidden(
	layout: HomeLayout,
	key: string,
	hidden: boolean,
): HomeLayout {
	const rest = layout.hidden_catalogs.filter((entry) => entry !== key);
	return { ...layout, hidden_catalogs: hidden ? [...rest, key] : rest };
}

/**
 * Display titles for catalog rows. Cinemeta exposes the same catalog id
 * ("top" → "Popular") for movies and for series, so a name that appears more
 * than once in `entries` gets its type as a suffix ("Popular movies"). Home
 * and Settings → Home both label rows with this, so the two read the same.
 */
export function catalogTitles(
	entries: ReadonlyArray<{ title: string; type: string }>,
): string[] {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		counts.set(entry.title, (counts.get(entry.title) ?? 0) + 1);
	}
	return entries.map((entry) => {
		if ((counts.get(entry.title) ?? 0) > 1) {
			return entry.type === "series"
				? m.settings_catalog_title_series({ title: entry.title })
				: m.settings_catalog_title_movies({ title: entry.title });
		}
		return entry.title;
	});
}
