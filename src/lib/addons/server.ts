import { getRequestEvent } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";
import { AddonClient } from "./client.ts";
import {
	type AddonLoadError,
	type AddonRegistry,
	buildRegistry,
} from "./registry.ts";

export { requireProfile };

const REGISTRY_TTL_MS = 60_000;

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
	if (
		cache &&
		cache.profileId === profileId &&
		Date.now() - cache.at < REGISTRY_TTL_MS
	) {
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
