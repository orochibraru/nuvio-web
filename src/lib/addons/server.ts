import { requireProfile } from "#lib/server/guards.js";
import { getRequestEvent } from "$app/server";
import { AddonClient } from "./client.ts";
import {
	type AddonLoadError,
	type AddonRegistry,
	buildRegistry,
} from "./registry.ts";

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
