import { TtlCache } from "./cache.ts";
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

const RESPONSE_TTL_MS = 5 * 60 * 1000;
const responseCache = new TtlCache<unknown>(RESPONSE_TTL_MS);

export interface StreamWithSource extends Stream {
	addonId: string;
	addonName: string;
}

function buildResourceUrl(
	baseUrl: string,
	resource: AddonResourceName,
	type: string,
	id: string,
	extra?: ResourceExtra,
): string {
	const base = `${baseUrl}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
	const segment = extra
		? Object.entries(extra)
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

function normalizeMeta(raw: Meta): Meta {
	return {
		...raw,
		genres: stringList(raw.genres),
		cast: stringList(raw.cast),
		director: stringList(raw.director),
		writer: stringList(raw.writer),
		videos: asArray<MetaVideo>(raw.videos),
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
	) {}

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

		const data = await this.request(
			ref.addon,
			"catalog",
			query.type,
			query.id,
			extra,
			true,
		);
		return {
			metas: asArray<MetaPreview>((data as { metas?: unknown })?.metas).map(
				normalizePreview,
			),
			from: ref,
		};
	}

	async getMeta(
		type: string,
		id: string,
	): Promise<{ meta: Meta; addon: InstalledAddon } | null> {
		for (const addon of this.registry.providersFor("meta", type, id)) {
			try {
				const data = await this.request(
					addon,
					"meta",
					type,
					id,
					undefined,
					true,
				);
				const meta = (data as { meta?: Meta })?.meta;
				if (meta) {
					return { meta: normalizeMeta(meta), addon };
				}
			} catch {
				// fall through to the next meta provider
			}
		}
		return null;
	}

	async getStreams(
		type: string,
		id: string,
	): Promise<{ streams: StreamWithSource[]; errors: AddonError[] }> {
		const { items, errors } = await this.fanOut(
			"stream",
			type,
			id,
			(addon, data) =>
				asArray<Stream>((data as { streams?: unknown })?.streams).map(
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
	): Promise<{ subtitles: Subtitle[]; errors: AddonError[] }> {
		const { items, errors } = await this.fanOut(
			"subtitles",
			type,
			id,
			(_addon, data) =>
				asArray<Subtitle>((data as { subtitles?: unknown })?.subtitles),
			extra,
		);
		return { subtitles: items, errors };
	}

	private async fanOut<T>(
		resource: AddonResourceName,
		type: string,
		id: string,
		map: (addon: InstalledAddon, data: unknown) => T[],
		extra?: ResourceExtra,
	): Promise<{ items: T[]; errors: AddonError[] }> {
		const providers = this.registry.providersFor(resource, type, id);
		const errors: AddonError[] = [];

		const batches = await Promise.all(
			providers.map(async (addon) => {
				try {
					const data = await this.request(
						addon,
						resource,
						type,
						id,
						extra,
						false,
					);
					return map(addon, data);
				} catch (error) {
					errors.push({
						addonUrl: addon.url,
						addonName: addon.manifest.name,
						resource,
						message: errorMessage(error),
					});
					return [];
				}
			}),
		);

		return { items: batches.flat(), errors };
	}

	private async request(
		addon: InstalledAddon,
		resource: AddonResourceName,
		type: string,
		id: string,
		extra: ResourceExtra | undefined,
		cache: boolean,
	): Promise<unknown> {
		const url = buildResourceUrl(addon.baseUrl, resource, type, id, extra);
		if (cache) {
			const hit = responseCache.get(url);
			if (hit !== undefined) {
				return hit;
			}
		}

		const response = await this.fetchImpl(url, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(this.timeoutMs),
		});
		if (!response.ok) {
			throw new Error(`${resource} request failed with ${response.status}`);
		}
		const data = await response.json();
		if (cache) {
			responseCache.set(url, data);
		}
		return data;
	}
}
