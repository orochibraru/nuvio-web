import * as v from "valibot";
import { avatarCatalog } from "./avatars.ts";
import type { BackendStore, Entity, ItemInput, Scope } from "./store.ts";

const MAX_ITEMS = 2000;
const MAX_PROFILES = 6;
const DELTA_LIMIT = 1000;
const PROGRESS_SNAPSHOT_CAP = 200;
const COMPLETED_MIN_DURATION = 60_000;
const COMPLETED_RATIO = 0.9;

export interface Caller {
	store: BackendStore;
	userId: string;
	now: number;
}

export type RpcOutcome =
	| { ok: true; result: unknown }
	| { ok: false; issues: v.BaseIssue<unknown>[] };

export interface Rpc {
	authenticated: boolean;
	call: (caller: Caller, params: unknown) => RpcOutcome;
}

function define<Schema extends v.GenericSchema>(
	schema: Schema,
	run: (caller: Caller, params: v.InferOutput<Schema>) => unknown,
	authenticated = true,
): Rpc {
	return {
		authenticated,
		call: (caller, params) => {
			const parsed = v.safeParse(schema, params);
			return parsed.success
				? { ok: true, result: run(caller, parsed.output) }
				: { ok: false, issues: parsed.issues };
		},
	};
}

// Schemas

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const required = (max: number) =>
	v.pipe(v.string(), v.nonEmpty(), v.maxLength(max));
const optionalText = (max: number) => v.nullish(text(max), null);
const whole = v.pipe(
	v.number(),
	v.finite(),
	v.minValue(0),
	v.maxValue(Number.MAX_SAFE_INTEGER),
	v.transform(Math.round),
);
const optionalWhole = v.nullish(whole, null);
const bounded = (min: number, max: number) =>
	v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const list = <Item extends v.GenericSchema>(item: Item) =>
	v.pipe(v.array(item), v.maxLength(MAX_ITEMS));
const jsonObject = v.custom<Record<string, unknown>>(
	(value) =>
		typeof value === "object" && value !== null && !Array.isArray(value),
	"Expected a JSON object",
);
const profileIndex = bounded(1, MAX_PROFILES);
const profileParam = v.nullish(profileIndex, 1);
const platform = v.nullish(required(64), "tv");
const origin = v.nullish(text(256), null);
const sinceEvent = v.nullish(bounded(0, Number.MAX_SAFE_INTEGER), 0);
const deltaLimit = v.nullish(
	v.pipe(
		v.number(),
		v.integer(),
		v.transform((value) => Math.min(Math.max(value, 1), DELTA_LIMIT)),
	),
	DELTA_LIMIT,
);
const contentId = required(512);
const contentType = required(64);

const libraryItem = v.object({
	content_id: contentId,
	content_type: contentType,
	name: v.nullish(text(1024), ""),
	poster: optionalText(4096),
	poster_shape: v.nullish(required(32), "POSTER"),
	background: optionalText(4096),
	description: optionalText(20_000),
	release_info: optionalText(256),
	imdb_rating: v.nullish(v.pipe(v.number(), v.finite()), null),
	genres: v.nullish(v.pipe(v.array(text(256)), v.maxLength(100)), []),
	addon_base_url: optionalText(4096),
	added_at: optionalWhole,
});

const libraryKey = v.object({
	content_id: contentId,
	content_type: contentType,
});

const progressEntry = v.object({
	content_id: contentId,
	content_type: contentType,
	video_id: required(512),
	season: optionalWhole,
	episode: optionalWhole,
	position: whole,
	duration: whole,
	last_watched: whole,
});

const watchedItem = v.object({
	content_id: contentId,
	content_type: contentType,
	title: optionalText(1024),
	season: optionalWhole,
	episode: optionalWhole,
	watched_at: whole,
});

const watchedKey = v.object({
	content_id: contentId,
	season: optionalWhole,
	episode: optionalWhole,
});

const profileInput = v.object({
	profile_index: profileIndex,
	name: required(100),
	avatar_color_hex: v.nullish(text(32)),
	uses_primary_addons: v.nullish(v.boolean()),
	avatar_id: v.nullish(text(256)),
	avatar_url: v.optional(v.nullable(text(2048))),
});

const addonInput = v.object({
	url: required(2048),
	name: optionalText(256),
	enabled: v.nullish(v.boolean(), true),
	sort_order: v.nullish(bounded(-1_000_000, 1_000_000), 0),
});

const scoped = v.object({ p_profile_id: profileParam });
const named = v.object({ p_profile_id: profileIndex });
const deltaParams = v.object({
	p_profile_id: profileParam,
	p_since_event_id: sinceEvent,
	p_limit: deltaLimit,
});
const blobParams = v.object({
	p_profile_id: profileIndex,
	p_platform: platform,
});
const blobPush = v.object({
	p_profile_id: profileIndex,
	p_platform: platform,
	p_settings_json: jsonObject,
});

// Item identities and payloads

type LibraryItemParams = v.InferOutput<typeof libraryItem>;
type ProgressParams = v.InferOutput<typeof progressEntry>;
type WatchedParams = v.InferOutput<typeof watchedItem>;

function libraryKeyOf(item: { content_id: string; content_type: string }) {
	return JSON.stringify([item.content_type, item.content_id]);
}

function watchedKeyOf(item: {
	content_id: string;
	season: number | null;
	episode: number | null;
}) {
	return JSON.stringify([item.content_id, item.season, item.episode]);
}

/** The progress key the API documents; the server computes it, never the client. */
export function progressKey(entry: {
	content_id: string;
	season: number | null;
	episode: number | null;
}): string {
	return entry.season !== null && entry.episode !== null
		? `${entry.content_id}_s${entry.season}e${entry.episode}`
		: entry.content_id;
}

function scopeOf(caller: Caller, profileId: number): Scope {
	return { userId: caller.userId, profileId };
}

function libraryInputs(
	caller: Caller,
	scope: Scope,
	items: LibraryItemParams[],
): ItemInput[] {
	return items.map((item) => {
		const key = libraryKeyOf(item);
		const addedAt =
			item.added_at ??
			(caller.store.item("library", scope, key)?.added_at as
				| number
				| undefined) ??
			caller.now;
		return { key, data: { ...item, added_at: addedAt }, sortAt: addedAt };
	});
}

function watchedInput(
	caller: Caller,
	scope: Scope,
	item: WatchedParams,
): ItemInput {
	const key = watchedKeyOf(item);
	const title =
		item.title ??
		(caller.store.item("watched", scope, key)?.title as string | undefined) ??
		"";
	return { key, data: { ...item, title }, sortAt: item.watched_at };
}

function pushProgress(caller: Caller, scope: Scope, entries: ProgressParams[]) {
	const progress = entries.map((entry) => {
		const key = progressKey(entry);
		return {
			key,
			data: { ...entry, progress_key: key },
			sortAt: entry.last_watched,
		};
	});
	const completed = entries
		.filter(
			(entry) =>
				entry.duration >= COMPLETED_MIN_DURATION &&
				entry.position >= entry.duration * COMPLETED_RATIO,
		)
		.map((entry) =>
			watchedInput(caller, scope, {
				content_id: entry.content_id,
				content_type: entry.content_type,
				title: null,
				season: entry.season,
				episode: entry.episode,
				watched_at: entry.last_watched,
			}),
		);
	caller.store.db().transaction(() => {
		caller.store.upsertItems("progress", scope, progress, null);
		caller.store.upsertItems("watched", scope, completed, null);
	})();
}

function deltaOf(entity: Entity) {
	return define(deltaParams, (caller, params) =>
		caller.store.delta(
			entity,
			scopeOf(caller, params.p_profile_id),
			params.p_since_event_id,
			params.p_limit,
		),
	);
}

function cursorOf(entity: Entity) {
	return define(scoped, (caller, params) =>
		caller.store.cursor(entity, scopeOf(caller, params.p_profile_id)),
	);
}

function overview(caller: Caller) {
	const { store, userId } = caller;
	return {
		addons: store.counts("addons", userId),
		library_items: store.counts("library", userId),
		watch_progress: store.counts("progress", userId),
		watched_items: store.counts("watched", userId),
		profiles: Object.fromEntries(
			store
				.profiles(userId)
				.map((profile) => [
					String(profile.profile_index),
					{ name: profile.name, color: profile.avatar_color_hex },
				]),
		),
	};
}

const progressDelete = v.pipe(
	v.object({
		p_profile_id: profileParam,
		p_progress_key: v.nullish(required(600)),
		p_keys: v.nullish(list(required(600))),
	}),
	v.check(
		(params) => Boolean(params.p_keys ?? params.p_progress_key),
		"p_progress_key or p_keys is required",
	),
);

/** Every RPC in the snapshot, by name. A `Map`, so `__proto__` and friends are never a function. */
export const RPCS = new Map<string, Rpc>([
	[
		"sync_pull_profiles",
		define(v.object({}), (caller) => caller.store.profiles(caller.userId)),
	],
	[
		"sync_push_profiles",
		define(
			v.object({
				p_profiles: v.pipe(v.array(profileInput), v.maxLength(MAX_PROFILES)),
				p_client_max_profiles: v.nullish(profileIndex, 4),
			}),
			(caller, params) => {
				caller.store.replaceProfiles(
					caller.userId,
					params.p_profiles,
					params.p_client_max_profiles,
				);
			},
		),
	],
	[
		"sync_delete_profile_data",
		define(named, (caller, params) => {
			caller.store.deleteProfileData(scopeOf(caller, params.p_profile_id));
		}),
	],
	[
		"sync_push_addons",
		define(
			v.object({ p_profile_id: profileParam, p_addons: list(addonInput) }),
			(caller, params) => {
				caller.store.replaceAddons(
					scopeOf(caller, params.p_profile_id),
					params.p_addons,
				);
			},
		),
	],
	[
		"sync_pull_library",
		define(
			v.object({
				p_profile_id: profileParam,
				p_limit: v.nullish(bounded(1, 100_000), 500),
				p_offset: v.nullish(bounded(0, Number.MAX_SAFE_INTEGER), 0),
			}),
			(caller, params) =>
				caller.store.items("library", scopeOf(caller, params.p_profile_id), {
					limit: params.p_limit,
					offset: params.p_offset,
				}),
		),
	],
	["sync_get_library_delta_cursor", cursorOf("library")],
	["sync_pull_library_delta", deltaOf("library")],
	[
		"sync_push_library_items",
		define(
			v.object({
				p_profile_id: profileParam,
				p_items: list(libraryItem),
				p_origin_client_id: origin,
			}),
			(caller, params) => {
				const scope = scopeOf(caller, params.p_profile_id);
				caller.store.upsertItems(
					"library",
					scope,
					libraryInputs(caller, scope, params.p_items),
					params.p_origin_client_id,
				);
			},
		),
	],
	[
		"sync_delete_library_items",
		define(
			v.object({
				p_profile_id: profileParam,
				p_keys: list(libraryKey),
				p_origin_client_id: origin,
			}),
			(caller, params) => {
				caller.store.deleteItems(
					"library",
					scopeOf(caller, params.p_profile_id),
					params.p_keys.map(libraryKeyOf),
					params.p_origin_client_id,
				);
			},
		),
	],
	[
		"sync_push_library",
		define(
			v.object({ p_profile_id: profileParam, p_items: list(libraryItem) }),
			(caller, params) => {
				const scope = scopeOf(caller, params.p_profile_id);
				caller.store.replaceItems(
					"library",
					scope,
					libraryInputs(caller, scope, params.p_items),
				);
			},
		),
	],
	[
		"sync_pull_watch_progress",
		define(
			v.object({
				p_profile_id: profileParam,
				p_since_last_watched: optionalWhole,
				p_limit: v.nullish(bounded(1, 100_000), PROGRESS_SNAPSHOT_CAP),
			}),
			(caller, params) =>
				caller.store
					.items("progress", scopeOf(caller, params.p_profile_id), {
						since: params.p_since_last_watched,
						offset: 0,
						limit:
							params.p_since_last_watched === null
								? Math.min(params.p_limit, PROGRESS_SNAPSHOT_CAP)
								: params.p_limit,
					})
					.map(({ created_at: _created, updated_at: _updated, ...row }) => row),
		),
	],
	["sync_pull_watch_progress_delta", deltaOf("progress")],
	["sync_get_watch_progress_delta_cursor", cursorOf("progress")],
	[
		"sync_push_watch_progress",
		define(
			v.object({
				p_profile_id: profileParam,
				p_entries: v.nullish(list(progressEntry), []),
			}),
			(caller, params) => {
				pushProgress(
					caller,
					scopeOf(caller, params.p_profile_id),
					params.p_entries,
				);
			},
		),
	],
	[
		"sync_delete_watch_progress",
		define(progressDelete, (caller, params) => {
			caller.store.deleteItems(
				"progress",
				scopeOf(caller, params.p_profile_id),
				params.p_keys ?? [params.p_progress_key as string],
				null,
			);
		}),
	],
	[
		"sync_pull_watched_items",
		define(
			v.object({
				p_profile_id: profileParam,
				p_page: v.nullish(bounded(1, 1_000_000), 1),
				p_page_size: v.nullish(bounded(1, 100_000), 100_000),
			}),
			(caller, params) =>
				caller.store
					.items("watched", scopeOf(caller, params.p_profile_id), {
						limit: params.p_page_size,
						offset: (params.p_page - 1) * params.p_page_size,
					})
					.map(({ updated_at: _updated, ...row }) => row),
		),
	],
	["sync_pull_watched_items_delta", deltaOf("watched")],
	["sync_get_watched_items_delta_cursor", cursorOf("watched")],
	[
		"sync_push_watched_items",
		define(
			v.object({
				p_profile_id: profileParam,
				p_items: v.nullish(list(watchedItem), []),
			}),
			(caller, params) => {
				const scope = scopeOf(caller, params.p_profile_id);
				caller.store.upsertItems(
					"watched",
					scope,
					params.p_items.map((item) => watchedInput(caller, scope, item)),
					null,
				);
			},
		),
	],
	[
		"sync_delete_watched_items",
		define(
			v.object({ p_profile_id: profileParam, p_keys: list(watchedKey) }),
			(caller, params) => {
				caller.store.deleteItems(
					"watched",
					scopeOf(caller, params.p_profile_id),
					params.p_keys.map(watchedKeyOf),
					null,
				);
			},
		),
	],
	[
		"sync_pull_profile_settings_blob",
		define(blobParams, (caller, params) => {
			const blob = caller.store.blob(
				"settings",
				scopeOf(caller, params.p_profile_id),
				params.p_platform,
			);
			return blob
				? [
						{
							profile_id: params.p_profile_id,
							settings_json: blob.json,
							updated_at: blob.updated_at,
						},
					]
				: [];
		}),
	],
	[
		"sync_push_profile_settings_blob",
		define(blobPush, (caller, params) => {
			caller.store.writeBlob(
				"settings",
				scopeOf(caller, params.p_profile_id),
				params.p_platform,
				params.p_settings_json,
			);
		}),
	],
	[
		"sync_pull_home_catalog_settings",
		define(blobParams, (caller, params) => {
			const blob = caller.store.blob(
				"home_catalog",
				scopeOf(caller, params.p_profile_id),
				params.p_platform,
			);
			return blob
				? [
						{
							id: blob.id,
							user_id: caller.userId,
							profile_id: params.p_profile_id,
							platform: params.p_platform,
							settings_json: blob.json,
							updated_at: blob.updated_at,
						},
					]
				: [];
		}),
	],
	[
		"sync_push_home_catalog_settings",
		define(blobPush, (caller, params) => {
			caller.store.writeBlob(
				"home_catalog",
				scopeOf(caller, params.p_profile_id),
				params.p_platform,
				params.p_settings_json,
			);
		}),
	],
	[
		"sync_pull_collections",
		define(named, (caller, params) => {
			const blob = caller.store.blob(
				"collections",
				scopeOf(caller, params.p_profile_id),
				"",
			);
			return blob
				? [
						{
							profile_id: params.p_profile_id,
							collections_json: blob.json,
							updated_at: blob.updated_at,
						},
					]
				: [];
		}),
	],
	[
		"sync_push_collections",
		define(
			v.object({
				p_profile_id: profileIndex,
				p_collections_json: list(jsonObject),
			}),
			(caller, params) => {
				caller.store.writeBlob(
					"collections",
					scopeOf(caller, params.p_profile_id),
					"",
					params.p_collections_json,
				);
			},
		),
	],
	["get_avatar_catalog", define(v.object({}), () => avatarCatalog(), false)],
	["get_sync_overview", define(v.object({}), overview)],
	["health_ping", define(v.object({}), () => true, false)],
]);
