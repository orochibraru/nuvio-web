import { pooledMap } from "#lib/pool.js";
import { safeFetch } from "#lib/server/safe-fetch.js";

// Cap on simultaneous upstream addon requests during a fan-out : keeps a
// many-addon profile from bursting well past a sane per-user request rate.
const FANOUT_CONCURRENCY = 6;

import type { AddonRegistry, CatalogRef, InstalledAddon } from "./registry.ts";
import type {
	AddonError,
	AddonResourceName,
	CatalogQuery,
	Meta,
	MetaPreview,
	MetaVideo,
	ResourceExtra,
	Stream,
	Subtitle,
} from "./types.ts";

export interface StreamWithSource extends Stream {
	addonId: string;
	addonName: string;
}

export interface SubtitleWithSource extends Subtitle {
	addonId: string;
	addonName: string;
}

/** One addon listed by an `addon_catalog` response : enough to preview + install it. */
export interface AddonCatalogEntry {
	transportUrl: string;
	manifest: {
		id: string;
		name: string;
		description?: string;
		logo?: string;
		types: string[];
	};
}

/** Addon-supplied data : never trust the shape. Drops an entry missing what
 *  installing it needs (a URL) or showing it needs (an id + name). */
function normalizeAddonCatalogEntry(raw: unknown): AddonCatalogEntry | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const entry = raw as { transportUrl?: unknown; manifest?: unknown };
	if (typeof entry.transportUrl !== "string" || !entry.transportUrl) {
		return null;
	}
	const manifest = entry.manifest as
		| {
			id?: unknown;
			name?: unknown;
			description?: unknown;
			logo?: unknown;
			types?: unknown;
		}
		| null
		| undefined;
	if (
		!manifest ||
		typeof manifest.id !== "string" ||
		typeof manifest.name !== "string"
	) {
		return null;
	}
	return {
		transportUrl: entry.transportUrl,
		manifest: {
			id: manifest.id,
			name: manifest.name,
			description:
				typeof manifest.description === "string"
					? manifest.description
					: undefined,
			logo: typeof manifest.logo === "string" ? manifest.logo : undefined,
			types: Array.isArray(manifest.types)
				? manifest.types.filter((t): t is string => typeof t === "string")
				: [],
		},
	};
}

/** Addon resource request coordinates : everything but which addon serves it. */
interface ResourceRef {
	resource: AddonResourceName;
	type: string;
	id: string;
	extra?: ResourceExtra;
}

function buildResourceUrl(baseUrl: string, ref: ResourceRef): string {
	const base = `${baseUrl}/${ref.resource}/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.id)}`;
	const segment = ref.extra
		? Object.entries(ref.extra)
			.filter(([, value]) => value !== undefined && value !== "")
			.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
			.join("&")
		: "";
	return segment ? `${base}/${segment}.json` : `${base}.json`;
}

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

/** Addons are inconsistent: `genres`/`cast`/`director` come as `string[]`, a comma string, or absent. */
function stringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === "string");
	}
	if (typeof value === "string" && value.trim()) {
		return value
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function normalizePreview(raw: MetaPreview): MetaPreview {
	return { ...raw, genres: stringList(raw.genres) };
}

/** Cinemeta names the episode field `name`; the SDK spec calls it `title`. Accept both. */
function normalizeVideo(
	raw: MetaVideo & {
		name?: string;
		number?: number;
		description?: string;
		firstAired?: string;
		imdbRating?: string | number;
	},
): MetaVideo {
	const episode = raw.episode ?? raw.number;
	const rating =
		raw.rating ?? (raw.imdbRating != null ? String(raw.imdbRating) : undefined);
	return {
		...raw,
		title:
			raw.title ||
			raw.name ||
			(episode != null ? `Episode ${episode}` : "Episode"),
		episode,
		overview: raw.overview || raw.description,
		released: raw.released || raw.firstAired,
		rating: rating && rating !== "0" ? rating : undefined,
	};
}

/**
 * Pull people out of `meta.links` (Cinemeta's newer shape puts cast / crew
 * there : `{ name, category, url: "stremio:///search?search=..." }` : and leaves
 * the flat `cast` / `director` / `writer` fields empty).
 */
function peopleFromLinks(links: Meta["links"], category: string): string[] {
	const wanted = category.toLowerCase();
	return (links ?? [])
		.filter((link) => link.category?.toLowerCase() === wanted)
		.map((link) => link.name.trim())
		.filter(Boolean);
}

function normalizeMeta(raw: Meta): Meta {
	const links = raw.links;
	const cast = stringList(raw.cast);
	const director = stringList(raw.director);
	const writer = stringList(raw.writer);
	return {
		...raw,
		genres: stringList(raw.genres),
		cast: cast.length ? cast : peopleFromLinks(links, "Cast"),
		director: director.length ? director : peopleFromLinks(links, "Directors"),
		writer: writer.length ? writer : peopleFromLinks(links, "Writers"),
		videos: asArray<
			MetaVideo & { name?: string; number?: number; description?: string }
		>(raw.videos).map(normalizeVideo),
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof DOMException && error.name === "TimeoutError") {
		return "Addon timed out";
	}
	return error instanceof Error ? error.message : "Addon request failed";
}

export class AddonClient {
	constructor(
		private readonly registry: AddonRegistry,
		private readonly fetchImpl: typeof fetch,
		private readonly timeoutMs = 15_000,
	) { }

	async getCatalog(
		query: CatalogQuery,
		addonId?: string,
	): Promise<{ metas: MetaPreview[]; from: CatalogRef } | null> {
		const ref = addonId
			? this.registry.findCatalog(addonId, query.type, query.id)
			: this.registry
				.catalogs()
				.find(
					(entry) =>
						entry.catalog.type === query.type &&
						entry.catalog.id === query.id,
				);
		if (!ref) {
			return null;
		}

		const extra: ResourceExtra = {};
		if (query.search) {
			extra.search = query.search;
		}
		if (query.genre) {
			extra.genre = query.genre;
		}
		if (query.skip) {
			extra.skip = query.skip;
		}

		const data = await this.request(ref.addon, {
			resource: "catalog",
			type: query.type,
			id: query.id,
			extra,
		});
		return {
			metas: asArray<MetaPreview>(
				(data as { metas?: unknown } | null)?.metas,
			).map(normalizePreview),
			from: ref,
		};
	}

	async getMeta(
		type: string,
		id: string,
	): Promise<{ meta: Meta; addon: InstalledAddon } | null> {
		// Query every meta provider at once; keep the first (registry order) that
		// actually returns a meta object.
		const providers = [...this.registry.providersFor("meta", type, id)];
		const responses = await Promise.allSettled(
			providers.map((addon) =>
				this.request(addon, { resource: "meta", type, id }),
			),
		);
		for (const [index, response] of responses.entries()) {
			if (response.status !== "fulfilled") {
				continue;
			}
			const meta = (response.value as { meta?: Meta } | null)?.meta;
			if (meta) {
				return { meta: normalizeMeta(meta), addon: providers[index] };
			}
		}
		return null;
	}

	async getStreams(
		type: string,
		id: string,
	): Promise<{ streams: StreamWithSource[]; errors: AddonError[] }> {
		const { items, errors } = await this.fanOut(
			{ resource: "stream", type, id },
			(addon, data) =>
				asArray<Stream>((data as { streams?: unknown } | null)?.streams).map(
					(stream) => ({
						...stream,
						addonId: addon.manifest.id,
						addonName: addon.manifest.name,
					}),
				),
		);
		return { streams: items, errors };
	}

	async getSubtitles(
		type: string,
		id: string,
		extra?: ResourceExtra,
	): Promise<{ subtitles: SubtitleWithSource[]; errors: AddonError[] }> {
		const { items, errors } = await this.fanOut(
			{ resource: "subtitles", type, id, extra },
			(addon, data) =>
				asArray<Subtitle>(
					(data as { subtitles?: unknown } | null)?.subtitles,
				).map((subtitle) => ({
					...subtitle,
					addonId: addon.manifest.id,
					addonName: addon.manifest.name,
				})),
		);
		return { subtitles: items, errors };
	}

	/**
	 * One `addon_catalog` : an addon-hosted directory of *other* addons (a
	 * community repository, say). Unlike `getCatalog` / `fanOut`, this targets
	 * one specific addon's specific catalog; the caller already knows which
	 * one from `AddonRegistry.addonCatalogs()`.
	 */
	async getAddonCatalog(
		addonId: string,
		type: string,
		id: string,
	): Promise<{ addons: AddonCatalogEntry[] } | null> {
		const ref = this.registry.findAddonCatalog(addonId, type, id);
		if (!ref) {
			return null;
		}
		const data = await this.request(ref.addon, {
			resource: "addon_catalog",
			type,
			id,
		});
		return {
			addons: asArray<unknown>((data as { addons?: unknown } | null)?.addons)
				.map(normalizeAddonCatalogEntry)
				.filter((entry): entry is AddonCatalogEntry => entry !== null),
		};
	}

	private async fanOut<T>(
		ref: ResourceRef,
		map: (addon: InstalledAddon, data: unknown) => T[],
	): Promise<{ items: T[]; errors: AddonError[] }> {
		const providers = this.registry.providersFor(
			ref.resource,
			ref.type,
			ref.id,
		);
		const errors: AddonError[] = [];

		const batches = await pooledMap(
			providers,
			FANOUT_CONCURRENCY,
			async (addon) => {
				try {
					const data = await this.request(addon, ref);
					return map(addon, data);
				} catch (error) {
					errors.push({
						addonUrl: addon.url,
						addonName: addon.manifest.name,
						resource: ref.resource,
						message: errorMessage(error),
					});
					return [] as T[];
				}
			},
		);

		return { items: batches.flat(), errors };
	}

	/**
	 * Addon responses are **never cached server-side** : catalog / meta / stream
	 * payloads point at third-party content and the server must not retain them.
	 * The browser's HTTP cache still honours whatever the addon sends.
	 */
	private async request(
		addon: InstalledAddon,
		ref: ResourceRef,
	): Promise<unknown> {
		const url = buildResourceUrl(addon.baseUrl, ref);
		const response = await safeFetch(
			url,
			this.fetchImpl,
			{
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(this.timeoutMs),
			},
			{ allowHttp: true },
		);
		if (!response.ok) {
			throw new Error(`${ref.resource} request failed with ${response.status}`);
		}
		return response.json();
	}
}
