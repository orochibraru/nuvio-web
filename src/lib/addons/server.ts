import { requireProfile } from "#lib/server/guards.js";
import { getRequestEvent } from "$app/server";
import * as queries from "./catalog-queries.ts";
import { AddonClient } from "./client.ts";
import {
	type AddonLoadError,
	type AddonRegistry,
	buildRegistry,
} from "./registry.ts";
import type { Meta, MetaPreview } from "./types.ts";

export { requireProfile };

const REGISTRY_TTL_MS = 60_000;
// When the last build couldn't reach an addon, re-check far sooner so a
// transient outage recovers in seconds rather than up to a minute.
const REGISTRY_RETRY_TTL_MS = 5000;

let cache: {
	profileId: number;
	at: number;
	registry: AddonRegistry;
	errors: AddonLoadError[];
} | null = null;

export async function getRegistry(): Promise<{
	registry: AddonRegistry;
	errors: AddonLoadError[];
}> {
	const { event, profileId } = requireProfile();
	const ttl =
		cache && cache.errors.length > 0 ? REGISTRY_RETRY_TTL_MS : REGISTRY_TTL_MS;
	if (cache && cache.profileId === profileId && Date.now() - cache.at < ttl) {
		return { registry: cache.registry, errors: cache.errors };
	}
	const rows = await event.locals.nuvio.addons.list(profileId);
	const built = await buildRegistry(rows, event.fetch);
	cache = { profileId, at: Date.now(), ...built };
	return built;
}

export function invalidateRegistry(): void {
	cache = null;
}

/** Every catalog across the enabled addons — for the discover / collection loads. */
export async function listCatalogs(): Promise<
	Array<{
		addonId: string;
		addonName: string;
		type: string;
		id: string;
		name: string;
		genres: string[];
		extraSupported: string[];
	}>
> {
	const { registry } = await getRegistry().catch(() => ({
		registry: null as AddonRegistry | null,
	}));
	if (!registry) {
		return [];
	}
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
}

export async function getAddonClient(): Promise<{
	client: AddonClient;
	registry: AddonRegistry;
	errors: AddonLoadError[];
}> {
	const { registry, errors } = await getRegistry();
	return {
		client: new AddonClient(registry, getRequestEvent().fetch),
		registry,
		errors,
	};
}

export type {
	CatalogSelector,
	HomeRow,
} from "./catalog-queries.ts";

/**
 * Thin request-scoped wrappers over `catalog-queries.ts`: grab this request's
 * addon client, then delegate. The loads call these directly (streamed, never
 * awaited in the load itself) so addon fetches start server-side instead of
 * after the page has shipped, hydrated and made a second round trip.
 */
export async function homeCatalogRows(): Promise<queries.HomeRow[]> {
	const { client, registry } = await getAddonClient();
	return queries.homeCatalogRows(client, registry);
}

export async function searchAllCatalogs(
	term: string,
): Promise<{ metas: MetaPreview[] }> {
	const { client, registry } = await getAddonClient();
	return queries.searchAllCatalogs(client, registry, term);
}

export async function similarToTitle(
	type: string,
	id: string,
	genres: string[],
): Promise<{ metas: MetaPreview[] }> {
	const { client, registry } = await getAddonClient();
	return queries.similarToTitle(client, registry, { type, id, genres });
}

export async function catalogPage(selector: queries.CatalogSelector): Promise<{
	metas: MetaPreview[];
	addon: { id: string; name: string };
} | null> {
	const { client } = await getAddonClient();
	return queries.catalogPage(client, selector);
}

export async function titleMeta(
	type: string,
	id: string,
): Promise<{ meta: Meta; addonName: string } | null> {
	const { client } = await getAddonClient();
	return queries.titleMeta(client, type, id);
}
