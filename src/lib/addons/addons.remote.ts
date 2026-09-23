import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { addonUrl } from "#lib/forms/schemas.js";
import { m } from "#lib/i18n/index.js";
import type { AddonInput } from "#lib/nuvio/index.js";
import { pinnedFetch } from "#lib/server/safe-fetch.js";
import { LOGGER } from "#lib/services/index.js";
import { command, query } from "$app/server";
import { fetchManifest } from "./manifest.ts";
import {
	catalogPage,
	getAddonClient,
	getRegistry,
	invalidateRegistry,
	requireProfile,
	similarToTitle,
	titleMeta,
} from "./server.ts";

export const installedAddons = query(async () => {
	const { event, profileId } = requireProfile();
	const [rows, { registry, errors }] = await Promise.all([
		event.locals.nuvio.addons.list(profileId),
		getRegistry(),
	]);
	const infoByUrl = new Map(
		registry.addons.map((addon) => [
			addon.url,
			{ manifest: addon.manifest, baseUrl: addon.baseUrl },
		]),
	);
	return {
		addons: rows
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((row) => {
				const info = infoByUrl.get(row.url);
				const manifest = info?.manifest;
				const hints = manifest?.behaviorHints;
				return {
					url: row.url,
					name: manifest?.name ?? row.name ?? row.url,
					enabled: row.enabled,
					sortOrder: row.sort_order,
					description: manifest?.description ?? null,
					logo: manifest?.logo ?? null,
					types: manifest?.types ?? [],
					resources:
						manifest?.resources.map((r) =>
							typeof r === "string" ? r : r.name,
						) ?? [],
					catalogCount: manifest?.catalogs.length ?? 0,
					reachable: Boolean(manifest),
					// Stremio convention: a configurable addon serves its settings UI
					// at `{transportUrl}/configure`.
					configureUrl:
						info && (hints?.configurable || hints?.configurationRequired)
							? `${info.baseUrl}/configure`
							: null,
				};
			}),
		errors,
	};
});

/**
 * What the add dialog may say about a failed preview. Never the cause's own
 * message: that would echo "connection refused" vs "timed out" vs "disallowed
 * address" for any URL a signed-in user types, i.e. a port scanner. The detail
 * goes to the server log instead.
 */
function previewFailure(cause: unknown): string {
	const invalidManifest =
		cause instanceof SyntaxError ||
		(cause instanceof Error && cause.message.startsWith("Manifest "));
	return invalidManifest
		? m.settings_addons_invalid_manifest()
		: m.settings_addons_preview_unreachable();
}

export const previewAddon = command(addonUrl, async (url) => {
	const { event } = requireProfile();
	try {
		const { manifest, baseUrl } = await fetchManifest(url, pinnedFetch, {
			force: true,
		});
		return {
			ok: true as const,
			baseUrl,
			manifest: {
				id: manifest.id,
				name: manifest.name,
				version: manifest.version,
				description: manifest.description ?? null,
				logo: manifest.logo ?? null,
				types: manifest.types,
				resources: manifest.resources.map((r) =>
					typeof r === "string" ? r : r.name,
				),
				catalogCount: manifest.catalogs.length,
				catalogs: manifest.catalogs
					.slice(0, 40)
					.map((c) => ({ type: c.type, name: c.name ?? c.id })),
			},
		};
	} catch (cause) {
		// The origin only: an addon URL's path often carries a debrid key.
		event.locals.services.get(LOGGER).warn("Addon preview failed", {
			origin: new URL(url).origin,
			error: String(cause),
		});
		return { ok: false as const, message: previewFailure(cause) };
	}
});

const addonListSchema = v.array(
	v.object({
		url: v.pipe(v.string(), v.trim(), v.url()),
		name: v.optional(v.string()),
		enabled: v.optional(v.boolean(), true),
	}),
);

export const saveAddons = command(addonListSchema, async (addons) => {
	const { event, profileId } = requireProfile();
	const payload: AddonInput[] = addons.map((addon, index) => ({
		url: addon.url,
		name: addon.name,
		enabled: addon.enabled,
		sort_order: index,
	}));
	await event.locals.nuvio.addons.replace({
		p_profile_id: profileId,
		p_addons: payload,
	});
	invalidateRegistry();
	await installedAddons().refresh();
	return { count: payload.length };
});

const catalogSchema = v.object({
	type: v.string(),
	id: v.string(),
	addonId: v.optional(v.string()),
	genre: v.optional(v.string()),
	skip: v.optional(v.number()),
	search: v.optional(v.string()),
});

/** Client-initiated paging ("Load more"). The *first* page comes from the
 *  discover load instead : see `catalogPage` in `server.ts`. */
export const browseCatalog = query(catalogSchema, async (selector) => {
	const page = await catalogPage(selector);
	if (!page) {
		error(404, m.error_catalog_not_found());
	}
	return page;
});

/** Every `addon_catalog` an installed addon advertises : a directory of other addons. */
export const addonCatalogSources = query(async () => {
	const { registry } = await getAddonClient();
	return registry.addonCatalogs().map(({ addon, catalog }) => ({
		addonId: addon.manifest.id,
		addonName: addon.manifest.name,
		type: catalog.type,
		id: catalog.id,
		name: catalog.name ?? addon.manifest.name,
	}));
});

export const browseAddonCatalog = query(
	v.object({ addonId: v.string(), type: v.string(), id: v.string() }),
	async ({ addonId, type, id }) => {
		const { client } = await getAddonClient();
		const result = await client.getAddonCatalog(addonId, type, id);
		if (!result) {
			error(404, m.error_addon_catalog_not_found());
		}
		return result;
	},
);

/** One-off client lookups (e.g. "mark all watched" from a poster). The
 *  detail / player loads call `titleMeta` directly. */
export const getMeta = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const result = await titleMeta(type, id);
		if (!result) {
			error(404, m.error_no_metadata());
		}
		return result;
	},
);

/**
 * "More like this" : no catalog / meta provider exposes a real "similar" list, so
 * approximate it: the biggest catalog of the right type, filtered to a shared
 * genre, minus the title itself.
 */
/** Kept for parity; the detail load calls `similarToTitle` directly. */
export const similarTitles = query(
	v.object({
		type: v.string(),
		id: v.string(),
		genres: v.array(v.string()),
	}),
	({ type, id, genres }) => similarToTitle(type, id, genres),
);
