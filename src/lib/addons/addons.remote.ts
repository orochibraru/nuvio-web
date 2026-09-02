import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { AddonInput } from "#lib/nuvio/index.js";
import { command, getRequestEvent, query } from "$app/server";
import { fetchManifest } from "./manifest.ts";
import {
	getAddonClient,
	getRegistry,
	invalidateRegistry,
	requireProfile,
} from "./server.ts";
import type { MetaPreview } from "./types.ts";

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

export const previewAddon = command(
	v.pipe(v.string(), v.trim(), v.url("Enter a valid addon URL.")),
	async (url) => {
		requireProfile();
		try {
			const { manifest, baseUrl } = await fetchManifest(
				url,
				getRequestEvent().fetch,
				{ force: true },
			);
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
			return {
				ok: false as const,
				message:
					cause instanceof Error ? cause.message : "Could not load this addon",
			};
		}
	},
);

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

export const browseCatalog = query(
	catalogSchema,
	async ({ type, id, addonId, genre, skip, search }) => {
		const { client } = await getAddonClient();
		const result = await client.getCatalog(
			{ type, id, genre, skip, search },
			addonId,
		);
		if (!result) {
			error(404, "Catalog not found");
		}
		return {
			metas: result.metas,
			addon: {
				id: result.from.addon.manifest.id,
				name: result.from.addon.manifest.name,
			},
		};
	},
);

/** Every `addon_catalog` an installed addon advertises — a directory of other addons. */
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
			error(404, "Addon catalog not found");
		}
		return result;
	},
);

export const getMeta = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const result = await client.getMeta(type, id);
		if (!result) {
			error(404, "No metadata for this title");
		}
		return { meta: result.meta, addonName: result.addon.manifest.name };
	},
);

export const getStreams = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		return client.getStreams(type, id);
	},
);

/**
 * "More like this" — no catalog / meta provider exposes a real "similar" list, so
 * approximate it: the biggest catalog of the right type, filtered to a shared
 * genre, minus the title itself.
 */
export const similarTitles = query(
	v.object({
		type: v.string(),
		id: v.string(),
		genres: v.array(v.string()),
	}),
	async ({ type, id, genres }) => {
		const { client, registry } = await getAddonClient();
		const candidates = registry
			.catalogs()
			.filter(
				({ catalog }) =>
					catalog.type === type && !catalog.extraRequired?.length,
			)
			.slice(0, 6);
		if (candidates.length === 0) {
			return { metas: [] };
		}
		const wanted = genres.slice(0, 2);
		// Fan every (genre × catalog) probe out at once, then take the first —
		// genre-major, then catalog order — that yields enough titles.
		const probes = (wanted.length > 0 ? wanted : [undefined]).flatMap((genre) =>
			candidates.map(({ addon, catalog }) => ({ genre, addon, catalog })),
		);
		const results = await Promise.allSettled(
			probes.map(({ genre, addon, catalog }) =>
				client.getCatalog(
					{ type: catalog.type, id: catalog.id, genre },
					addon.manifest.id,
				),
			),
		);
		for (const result of results) {
			if (result.status !== "fulfilled") {
				continue;
			}
			const metas = (result.value?.metas ?? [])
				.filter((meta) => meta.id !== id)
				.slice(0, 20);
			if (metas.length >= 6) {
				return { metas };
			}
		}
		return { metas: [] };
	},
);

export const homeRows = query(async () => {
	const { client, registry } = await getAddonClient();
	const catalogs = registry
		.catalogs()
		.filter(({ catalog }) => !catalog.extraRequired?.length)
		.slice(0, 8);

	const rows = await Promise.all(
		catalogs.map(async ({ addon, catalog }) => {
			try {
				const result = await client.getCatalog(
					{ type: catalog.type, id: catalog.id },
					addon.manifest.id,
				);
				return {
					addonId: addon.manifest.id,
					addonName: addon.manifest.name,
					type: catalog.type,
					id: catalog.id,
					title: catalog.name ?? addon.manifest.name,
					metas: (result?.metas ?? []).slice(0, 20),
				};
			} catch {
				return null;
			}
		}),
	);

	return rows.filter(
		(row): row is NonNullable<typeof row> =>
			row != null && row.metas.length > 0,
	);
});

export const searchCatalogs = query(
	v.pipe(v.string(), v.trim(), v.minLength(1)),
	async (term) => {
		const { client, registry } = await getAddonClient();

		const searchable = registry
			.catalogs()
			.filter(({ catalog }) => catalogSupports(catalog, "search"));

		const batches = await Promise.all(
			searchable.map(async ({ addon, catalog }) => {
				try {
					const result = await client.getCatalog(
						{ type: catalog.type, id: catalog.id, search: term },
						addon.manifest.id,
					);
					return result?.metas ?? [];
				} catch {
					return [];
				}
			}),
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
	},
);
