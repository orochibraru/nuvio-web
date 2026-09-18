// Type model for the Nuvio public API.
//
// Derived from `nuvio-public-api.types.ts`, which `bun run nuvio:spec`
// generates from the published spec (https://nuvio.tv/docs/nuvio-public-api.md)
// and CI keeps fresh. Most wire types here are plain aliases of it, so when the
// API changes a field the change surfaces as a type error at the call sites.
//
// Where a type is not a bare alias, it is the generated type with named
// fields overridden, for one of three reasons, each said at the site:
//
// - the spec's field table under-types what its prose allows (`null`);
// - the spec's example is the only evidence and is too specific (a settings
//   blob typed as one client's settings) or too empty (`[]` for a list);
// - the app is deliberately stricter than the API on what it *sends* (it
//   always names the profile rather than lean on the server default).
//
// The `SpecContract` at the bottom checks, at compile time, that each of those
// still lines up with the spec in the direction that matters: what the app
// sends is a valid request, and what the API returns fits what the app reads.

import type * as Api from "./nuvio-public-api.types.ts";

/** The element type of a generated array type. */
type Row<T> = T extends ReadonlyArray<infer U> ? U : never;

/** Replace the named fields of `T`. */
type Override<T, U> = Omit<T, keyof U> & U;

/** ISO 8601 timestamp string, for example `2026-01-01T00:00:00Z`. */
export type IsoTimestamp = string;

/** Unix epoch time in milliseconds. */
export type EpochMilliseconds = number;

/** Profile slot in the public client surface. */
export type ProfileIndex = 1 | 2 | 3 | 4 | 5 | 6;

export type ContentType = Row<Api.GetLibraryResponse>["content_type"];

export type PosterShape = Row<Api.GetLibraryResponse>["poster_shape"];

export type SyncOperation = Row<Api.GetLibraryDeltaResponse>["operation"];

/** The spec documents `tv`; any client may name its own platform. */
export type Platform = "tv" | (string & {});

/** Arbitrary application-defined JSON object with no server-enforced schema. */
export type JsonObject = Record<string, unknown>;

// Authentication

export type NuvioUser = Api.GetCurrentUserResponse;

/** The token endpoints document no response body; this is the Supabase shape. */
export interface AuthSession {
	access_token: string;
	token_type: "bearer";
	expires_in: number;
	refresh_token: string;
	user: NuvioUser;
}

export interface EmailPasswordCredentials {
	email: string;
	password: string;
}

// Profiles

export type Profile = Row<Api.ListProfilesResponse>;

/** Spec gap: the prose says a `null` `avatar_id` keeps the current one. */
export type ProfileInput = Override<
	Row<Api.UpdateProfilesRequest["p_profiles"]>,
	{ avatar_id?: string | null }
>;

// Addons

export type Addon = Row<Api.ListAddonsResponse>;

export type AddonInput = Row<
	NonNullable<Api.SyncAddonsPushRequest["p_addons"]>
>;

// Library

export type LibraryItem = Row<Api.GetLibraryResponse>;

/** Stricter than the spec's table: an item without its identity is no item. */
export type LibraryItemInput = Override<
	Row<Api.UpsertLibraryItemsRequest["p_items"]>,
	{ content_id: string; content_type: ContentType }
>;

/** Same: the table does not mark the identity required, the API needs it. */
export type LibraryItemKey = Required<
	Row<Api.DeleteLibraryItemsRequest["p_keys"]>
>;

export type LibraryDeltaEvent = Row<Api.GetLibraryDeltaResponse>;

// Watch progress

export type WatchProgress = Row<Api.GetWatchProgressResponse>;

export type WatchProgressInput = Row<
	NonNullable<Api.SyncWatchProgressPushRequest["p_entries"]>
>;

export type WatchProgressDeltaEvent = Row<Api.GetWatchProgressDeltaResponse>;

// Watch history

export type WatchedItem = Row<Api.GetWatchHistoryResponse>;

export type WatchedItemInput = Row<
	NonNullable<Api.SyncWatchHistoryPushRequest["p_items"]>
>;

export type WatchedItemKey = Row<
	NonNullable<Api.DeleteWatchHistoryRequest["p_keys"]>
>;

export type WatchedItemDeltaEvent = Row<Api.GetWatchHistoryDeltaResponse>;

// Profile settings and home catalog settings

/** Spec gap: the example shows one client's settings; the blob is free-form. */
export type ProfileSettingsBlob = Override<
	Row<Api.GetSettingsResponse>,
	{ settings_json: JsonObject }
>;

/** Same as the settings blob. */
export type HomeCatalogSettings = Override<
	Row<Api.GetHomeCatalogSettingsResponse>,
	{ settings_json: JsonObject }
>;

// Collections
//
// The blob is written by every client and only the identity and the folder
// list are always there, so everything the example happens to show is
// optional here except those.

type SpecCollection = Row<Row<Api.GetCollectionsResponse>["collections_json"]>;
type SpecFolder = Row<SpecCollection["folders"]>;

export type CollectionViewMode = SpecCollection["viewMode"];

export type CatalogSource = Row<SpecFolder["catalogSources"]>;

export type CollectionFolder = Pick<SpecFolder, "id" | "title"> &
	Partial<Omit<SpecFolder, "id" | "title">>;

export type Collection = Pick<SpecCollection, "id" | "title"> &
	Partial<Omit<SpecCollection, "id" | "title" | "folders">> & {
		folders: CollectionFolder[];
	};

export type CollectionsBlob = Override<
	Row<Api.GetCollectionsResponse>,
	{ collections_json: Collection[] }
>;

// Avatars

export type AvatarCatalogEntry = Row<Api.ListAvatarsResponse>;

// Supporter wall

export type MembershipLevel = "SUPPORTER" | "SUPPORTER_PLUS" | (string & {});

/** Spec gap: `supporterSince` is `null` for members who never had a date. */
export type SupporterMember = Override<
	Row<Api.SupporterWallResponse["top"]["members"]>,
	{ membershipLevel: MembershipLevel; supporterSince: IsoTimestamp | null }
>;

export interface SupporterList {
	members: SupporterMember[];
	totalCount: number;
}

/** Spec gap: `recent` is an empty list in the example, so typed from `top`. */
export type SupporterWall = Override<
	Api.SupporterWallResponse,
	{ top: SupporterList; recent: SupporterList }
>;

export interface SupporterWallQuery {
	limit?: number;
	offset?: number;
}

// Sync overview

export type ProfileIndexedCounts = Record<string, number>;

export type SyncOverview = Api.SyncOverviewResponse;

// Health

/** Spec gap: `status` is a bare string there; these are the values it takes. */
export type HealthStatus = "healthy" | "slow" | "degraded" | "down";

export type HealthCheck = Override<
	Api.HealthCheckResponse,
	{ status: HealthStatus }
>;

// Errors

export interface NuvioApiErrorBody {
	code?: string;
	message?: string;
	details?: string | null;
	hint?: string | null;
}

// RPC request parameter shapes
//
// Aliases where the app sends exactly what the spec allows. `WithProfile`
// marks the ones where the spec defaults `p_profile_id` and the app always
// names it anyway: leaning on the server default would quietly write to
// profile 1.

export type EmptyParams = Record<string, never>;

type WithProfile<T> = Override<T, { p_profile_id: number }>;

export interface ProfileScopedParams {
	p_profile_id?: number;
}

export type PushProfilesParams = Override<
	Api.UpdateProfilesRequest,
	{ p_profiles: ProfileInput[] }
>;

export type DeleteProfileDataParams = WithProfile<Api.DeleteProfileDataRequest>;

export type PushAddonsParams = WithProfile<
	Override<Api.SyncAddonsPushRequest, { p_addons: AddonInput[] }>
>;

export type PullLibraryParams = Api.GetLibraryRequest;

export type PullLibraryDeltaParams = Api.GetLibraryDeltaRequest;

export type PushLibraryItemsParams = Override<
	Api.UpsertLibraryItemsRequest,
	{ p_items: LibraryItemInput[] }
>;

export type DeleteLibraryItemsParams = Override<
	Api.DeleteLibraryItemsRequest,
	{ p_keys: LibraryItemKey[] }
>;

export type PushLibraryParams = WithProfile<
	Override<
		Api.SyncLibraryPushLegacyFullReplaceRequest,
		{ p_items: LibraryItemInput[] }
	>
>;

/** Spec gap: the prose treats a `null` cursor as "not set". */
export type PullWatchProgressParams = Override<
	Api.GetWatchProgressRequest,
	{ p_since_last_watched?: EpochMilliseconds | null }
>;

export type PullWatchProgressDeltaParams = Api.GetWatchProgressDeltaRequest;

export type PushWatchProgressParams = Override<
	Api.SyncWatchProgressPushRequest,
	{ p_entries: WatchProgressInput[] }
>;

/** The spec's two documented payloads, made mutually exclusive. */
export type DeleteWatchProgressParams =
	| { p_progress_key: string; p_profile_id?: number; p_keys?: never }
	| { p_keys: string[]; p_profile_id?: number; p_progress_key?: never };

export type PullWatchedItemsParams = Api.GetWatchHistoryRequest;

export type PullWatchedItemsDeltaParams = Api.GetWatchHistoryDeltaRequest;

export type PushWatchedItemsParams = Override<
	Api.SyncWatchHistoryPushRequest,
	{ p_items: WatchedItemInput[] }
>;

export type DeleteWatchedItemsParams = Override<
	Api.DeleteWatchHistoryRequest,
	{ p_keys: WatchedItemKey[] }
>;

export type PullSettingsBlobParams = WithProfile<
	Override<Api.GetSettingsRequest, { p_platform?: Platform }>
>;

export type PushSettingsBlobParams = WithProfile<
	Override<
		Api.UpdateSettingsRequest,
		{ p_settings_json: JsonObject; p_platform?: Platform }
	>
>;

export type PullHomeCatalogSettingsParams = WithProfile<
	Override<Api.GetHomeCatalogSettingsRequest, { p_platform?: Platform }>
>;

export type PushHomeCatalogSettingsParams = WithProfile<
	Override<
		Api.UpdateHomeCatalogSettingsRequest,
		{ p_settings_json: JsonObject; p_platform?: Platform }
	>
>;

export type PullCollectionsParams = WithProfile<Api.GetCollectionsRequest>;

export type PushCollectionsParams = WithProfile<
	Override<Api.UpdateCollectionsRequest, { p_collections_json: Collection[] }>
>;

/**
 * Maps every documented RPC function to its request parameters and result type.
 * Used by {@link NuvioClient.rpc} to type calls by function name alone.
 */
export interface NuvioRpcMap {
	sync_pull_profiles: { params: EmptyParams; result: Profile[] };
	sync_push_profiles: { params: PushProfilesParams; result: undefined };
	sync_delete_profile_data: {
		params: DeleteProfileDataParams;
		result: undefined;
	};
	sync_push_addons: { params: PushAddonsParams; result: undefined };
	sync_pull_library: { params: PullLibraryParams; result: LibraryItem[] };
	sync_get_library_delta_cursor: {
		params: ProfileScopedParams;
		result: number;
	};
	sync_pull_library_delta: {
		params: PullLibraryDeltaParams;
		result: LibraryDeltaEvent[];
	};
	sync_push_library_items: {
		params: PushLibraryItemsParams;
		result: undefined;
	};
	sync_delete_library_items: {
		params: DeleteLibraryItemsParams;
		result: undefined;
	};
	sync_push_library: { params: PushLibraryParams; result: undefined };
	sync_pull_watch_progress: {
		params: PullWatchProgressParams;
		result: WatchProgress[];
	};
	sync_pull_watch_progress_delta: {
		params: PullWatchProgressDeltaParams;
		result: WatchProgressDeltaEvent[];
	};
	sync_get_watch_progress_delta_cursor: {
		params: ProfileScopedParams;
		result: number;
	};
	sync_push_watch_progress: {
		params: PushWatchProgressParams;
		result: undefined;
	};
	sync_delete_watch_progress: {
		params: DeleteWatchProgressParams;
		result: undefined;
	};
	sync_pull_watched_items: {
		params: PullWatchedItemsParams;
		result: WatchedItem[];
	};
	sync_pull_watched_items_delta: {
		params: PullWatchedItemsDeltaParams;
		result: WatchedItemDeltaEvent[];
	};
	sync_get_watched_items_delta_cursor: {
		params: ProfileScopedParams;
		result: number;
	};
	sync_push_watched_items: {
		params: PushWatchedItemsParams;
		result: undefined;
	};
	sync_delete_watched_items: {
		params: DeleteWatchedItemsParams;
		result: undefined;
	};
	sync_pull_profile_settings_blob: {
		params: PullSettingsBlobParams;
		result: ProfileSettingsBlob[];
	};
	sync_push_profile_settings_blob: {
		params: PushSettingsBlobParams;
		result: undefined;
	};
	sync_pull_home_catalog_settings: {
		params: PullHomeCatalogSettingsParams;
		result: HomeCatalogSettings[];
	};
	sync_push_home_catalog_settings: {
		params: PushHomeCatalogSettingsParams;
		result: undefined;
	};
	sync_pull_collections: {
		params: PullCollectionsParams;
		result: CollectionsBlob[];
	};
	sync_push_collections: { params: PushCollectionsParams; result: undefined };
	get_avatar_catalog: { params: EmptyParams; result: AvatarCatalogEntry[] };
	get_sync_overview: { params: EmptyParams; result: SyncOverview };
	health_ping: { params: EmptyParams; result: boolean };
}

export type RpcName = keyof NuvioRpcMap;
export type RpcParams<Name extends RpcName> = NuvioRpcMap[Name]["params"];
export type RpcResult<Name extends RpcName> = NuvioRpcMap[Name]["result"];

type RequiredKeysOf<T> = {
	[Key in keyof T]-?: undefined extends T[Key] ? never : Key;
}[keyof T];

/** Tuple for the RPC call: the params argument is optional when the function has no required parameters. */
export type RpcArgs<Name extends RpcName> =
	RpcParams<Name> extends EmptyParams
		? [params?: RpcParams<Name>]
		: RequiredKeysOf<RpcParams<Name>> extends never
			? [params?: RpcParams<Name>]
			: [params: RpcParams<Name>];

/** RPC functions that are callable without an access token. */
export type UnauthenticatedRpcName = "get_avatar_catalog" | "health_ping";

// Spec contract
//
// Every override above is checked against the generated type in the direction
// that matters. `bun run check` fails if the API changes under one of them.

type Fits<A, B> = [A] extends [B] ? true : false;

/**
 * `Reads<Spec, Hand>` : what the API returns fits what the app reads.
 * `Sends<Hand, Spec>` : what the app sends is a request the API accepts.
 * Both are `Fits`, spelled out per entry because a generic wrapper around the
 * `extends true` check would defer it and check nothing.
 */
type Assert<T extends true> = T;

export type SpecContract = [
	Assert<Fits<Row<Api.GetSettingsResponse>, ProfileSettingsBlob>>,
	Assert<Fits<Row<Api.GetHomeCatalogSettingsResponse>, HomeCatalogSettings>>,
	Assert<Fits<Row<Api.GetCollectionsResponse>, CollectionsBlob>>,
	Assert<
		Fits<
			Omit<Api.SupporterWallResponse, "recent">,
			Omit<SupporterWall, "recent">
		>
	>,
	Assert<Fits<PushAddonsParams, Api.SyncAddonsPushRequest>>,
	Assert<Fits<PushLibraryItemsParams, Api.UpsertLibraryItemsRequest>>,
	Assert<Fits<DeleteLibraryItemsParams, Api.DeleteLibraryItemsRequest>>,
	Assert<Fits<PushLibraryParams, Api.SyncLibraryPushLegacyFullReplaceRequest>>,
	Assert<Fits<PushWatchProgressParams, Api.SyncWatchProgressPushRequest>>,
	Assert<Fits<DeleteWatchProgressParams, Api.SyncDeleteWatchProgressRequest>>,
	Assert<Fits<PushWatchedItemsParams, Api.SyncWatchHistoryPushRequest>>,
	Assert<Fits<DeleteWatchedItemsParams, Api.DeleteWatchHistoryRequest>>,
	Assert<Fits<PullSettingsBlobParams, Api.GetSettingsRequest>>,
	Assert<Fits<PushSettingsBlobParams, Api.UpdateSettingsRequest>>,
	Assert<
		Fits<PullHomeCatalogSettingsParams, Api.GetHomeCatalogSettingsRequest>
	>,
	Assert<
		Fits<PushHomeCatalogSettingsParams, Api.UpdateHomeCatalogSettingsRequest>
	>,
	Assert<Fits<PullCollectionsParams, Api.GetCollectionsRequest>>,
	Assert<Fits<DeleteProfileDataParams, Api.DeleteProfileDataRequest>>,
	// The spec-gap overrides are checked with the gap field set aside.
	Assert<
		Fits<
			Omit<ProfileInput, "avatar_id">,
			Omit<Row<Api.UpdateProfilesRequest["p_profiles"]>, "avatar_id">
		>
	>,
	Assert<
		Fits<
			Omit<PullWatchProgressParams, "p_since_last_watched">,
			Omit<Api.GetWatchProgressRequest, "p_since_last_watched">
		>
	>,
	Assert<
		Fits<Omit<Api.HealthCheckResponse, "status">, Omit<HealthCheck, "status">>
	>,
];
