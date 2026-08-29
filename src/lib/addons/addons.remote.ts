import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { command, getRequestEvent, query } from "$app/server";
import type { AddonInput } from "$lib/nuvio/index.js";
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
	const manifestByUrl = new Map(
		registry.addons.map((addon) => [addon.url, addon.manifest]),
	);
	return {
		addons: rows
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((row) => {
				const manifest = manifestByUrl.get(row.url);
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

export const catalogList = query(async () => {
	const { registry } = await getRegistry();
	return registry.catalogs().map(({ addon, catalog }) => ({
		addonId: addon.manifest.id,
		addonName: addon.manifest.name,
		type: catalog.type,
		id: catalog.id,
		name: catalog.name ?? `${addon.manifest.name}`,
		genres: catalog.genres ?? [],
		extraSupported:
			catalog.extraSupported ?? catalog.extra?.map((entry) => entry.name) ?? [],
	}));
});

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
