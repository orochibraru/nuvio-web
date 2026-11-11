import type { NuvioClient } from "#lib/nuvio/index.js";
import { requireProfile } from "#lib/server/guards.js";
import { pinnedFetch } from "#lib/server/safe-fetch.js";
import { LOGGER } from "#lib/services/index.js";
import { pullHomeLayout } from "#lib/settings/settings-data.js";
import { getRequestEvent } from "$app/server";
import * as queries from "./catalog-queries.ts";
import { AddonClient } from "./client.ts";
import type { DirectoryAddon, DirectorySource } from "./directory.ts";
import { fetchManifest, parseAddonUrl } from "./manifest.ts";
import {
	type AddonLoadError,
	type AddonRegistry,
	buildRegistry,
	type LoadFailure,
	loadFailure,
} from "./registry.ts";
import type { AddonManifest, Meta, MetaPreview } from "./types.ts";

export { requireProfile };

const REGISTRY_TTL_MS = 60_000;
// When the last build couldn't reach an addon, re-check far sooner so a
// transient outage recovers in seconds rather than up to a minute.
const REGISTRY_RETRY_TTL_MS = 5000;

/**
 * Process-wide, so the key has to identify the *account* and not just the
 * profile: `profileId` is the profile index, 1..6 within one Nuvio account, so
 * on an instance with more than one account (which `/admin` exists to support)
 * keying on it alone hands account B account A's addons, catalogs and streams
 * for the length of the TTL.
 */
function cacheKey(userId: string, profileId: number): string {
	return `${userId}:${profileId}`;
}

/** The account's first profile: the one whose addons the others can share. */
export const MAIN_PROFILE = 1;

/**
 * Whose addon list `profileId` uses: its own, or the main profile's when it is
 * set to share them (`uses_primary_addons`, a setting of Nuvio's other apps
 * too). `sharedFrom` names the main profile then.
 */
export async function addonOwner(
	nuvio: NuvioClient,
	profileId: number,
): Promise<{ profileId: number; sharedFrom: string | null }> {
	if (profileId === MAIN_PROFILE) {
		return { profileId, sharedFrom: null };
	}
	const profiles = await nuvio.profiles.list();
	const shares = profiles.find(
		(profile) => profile.profile_index === profileId,
	)?.uses_primary_addons;
	const main = profiles.find(
		(profile) => profile.profile_index === MAIN_PROFILE,
	);
	return shares && main
		? { profileId: MAIN_PROFILE, sharedFrom: main.name }
		: { profileId, sharedFrom: null };
}

// Addon egress never goes through a load's `event.fetch`: that one forwards the
// request's cookies (the `nuvio_session` tokens) to same-site targets, and an
// addon URL or redirect hop is attacker-chosen. `pinnedFetch` carries none and
// pins the connection to the address `safeFetch` validated.

const cache = new Map<
	string,
	{ at: number; registry: AddonRegistry; errors: AddonLoadError[] }
>();
// Per account, bumped by `invalidateRegistry`, so a build that started before
// it never caches.
const generations = new Map<string, number>();

export async function getRegistry(): Promise<{
	registry: AddonRegistry;
	errors: AddonLoadError[];
}> {
	const { event, profileId } = requireProfile();
	const userId = event.locals.session?.accountKey;
	// `requireProfile()` guarantees a session; the check keeps the type honest
	// and means a future refactor can't silently start sharing one cache entry.
	if (!userId) {
		const owner = await addonOwner(event.locals.nuvio, profileId);
		const rows = await event.locals.nuvio.addons.list(owner.profileId);
		return await buildRegistry(rows, pinnedFetch);
	}
	const key = cacheKey(userId, profileId);
	const hit = cache.get(key);
	const ttl =
		hit && hit.errors.length > 0 ? REGISTRY_RETRY_TTL_MS : REGISTRY_TTL_MS;
	if (hit && Date.now() - hit.at < ttl) {
		return { registry: hit.registry, errors: hit.errors };
	}
	const generation = generations.get(userId) ?? 0;
	const owner = await addonOwner(event.locals.nuvio, profileId);
	const rows = await event.locals.nuvio.addons.list(owner.profileId);
	const built = await buildRegistry(rows, pinnedFetch);
	if ((generations.get(userId) ?? 0) === generation) {
		pruneExpired();
		cache.set(key, { at: Date.now(), ...built });
	}
	return built;
}

/**
 * Drops entries nothing can serve from any more. One per account × profile is
 * a handful on a self-hosted instance, but the map lives as long as the
 * process, so nobody who signs in once should stay in it forever.
 */
function pruneExpired(): void {
	const now = Date.now();
	for (const [key, entry] of cache) {
		if (now - entry.at >= REGISTRY_TTL_MS) {
			cache.delete(key);
		}
	}
}

/**
 * Invalidates the calling account's entries only: every profile of it, since
 * the main profile's addons can be another's too. Clearing the whole map would
 * make one person's addon edit re-fan-out every other visitor's next page.
 */
export function invalidateRegistry(): void {
	const userId = getRequestEvent().locals.session?.accountKey;
	if (!userId) {
		return;
	}
	generations.set(userId, (generations.get(userId) ?? 0) + 1);
	for (const key of cache.keys()) {
		if (key.startsWith(`${userId}:`)) {
			cache.delete(key);
		}
	}
}

/** Every catalog across the enabled addons : for the discover / collection loads. */
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
	return registry.catalogs().map(({ addon, addonId, catalog }) => ({
		addonId,
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
		client: new AddonClient(
			registry,
			pinnedFetch,
			undefined,
			getRequestEvent().locals.services.get(LOGGER),
		),
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
	const { nuvio, profileId } = requireProfile();
	// Started before the registry build, not after: the two don't depend on
	// each other, and the layout pull is one small request.
	const layout = pullHomeLayout(nuvio, profileId);
	const { client, registry } = await getAddonClient();
	return queries.homeCatalogRows(client, registry, await layout);
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

export interface InstalledAddonRow {
	url: string;
	baseUrl: string;
	name?: string;
	enabled: boolean;
}

/** The addon rows the profile uses in their saved order, disabled ones included. */
export async function installedAddonRows(
	nuvio: NuvioClient,
	profileId: number,
): Promise<InstalledAddonRow[]> {
	const owner = await addonOwner(nuvio, profileId);
	const rows = await nuvio.addons.list(owner.profileId);
	return rows
		.sort((a, b) => a.sort_order - b.sort_order)
		.map((row) => ({
			url: row.url,
			baseUrl: parseAddonUrl(row.url).baseUrl,
			name: row.name ?? undefined,
			enabled: row.enabled,
		}));
}

export async function addonDirectory(
	nuvio: NuvioClient,
	profileId: number,
): Promise<{ sources: DirectorySource[]; addons: DirectoryAddon[] }> {
	const rows = installedAddonRows(nuvio, profileId).catch(() => []);
	const { client, registry } = await getAddonClient();
	const installedUrls = (await rows).map((row) => row.url);
	return queries.addonDirectory(client, registry, installedUrls);
}

export type AddonDetails =
	| { ok: true; baseUrl: string; manifest: AddonManifest }
	| { ok: false; reason: LoadFailure };

/** One addon's manifest, through the same capped, SSRF-guarded fetch as installing it. */
export async function addonDetails(url: string): Promise<AddonDetails> {
	requireProfile();
	try {
		const { manifest, baseUrl } = await fetchManifest(url, pinnedFetch);
		return { ok: true, baseUrl, manifest };
	} catch (cause) {
		return { ok: false, reason: loadFailure(cause) };
	}
}
