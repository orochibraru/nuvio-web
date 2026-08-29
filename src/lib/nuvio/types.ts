// Type model for the Nuvio public API (v1.3).
// Source: https://nuvio.tv/docs/nuvio-public-api.md

/** ISO 8601 timestamp string, for example `2026-01-01T00:00:00Z`. */
export type IsoTimestamp = string;

/** Unix epoch time in milliseconds. */
export type EpochMilliseconds = number;

/** Profile slot in the public client surface. */
export type ProfileIndex = 1 | 2 | 3 | 4 | 5 | 6;

export type ContentType = "movie" | "series";

export type PosterShape = "POSTER" | "LANDSCAPE" | "SQUARE";

export type SyncOperation = "upsert" | "delete";

export type Platform = "tv" | (string & {});

/** Arbitrary application-defined JSON object with no server-enforced schema. */
export type JsonObject = Record<string, unknown>;

// Authentication

export interface NuvioUser {
	id: string;
	email: string;
	created_at: IsoTimestamp;
}

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

export interface Profile {
	id: string;
	user_id: string;
	profile_index: number;
	name: string;
	avatar_color_hex: string;
	uses_primary_addons: boolean;
	avatar_id: string | null;
	avatar_url: string | null;
	pin_enabled: boolean;
	pin_locked_until: IsoTimestamp | null;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
}

export interface ProfileInput {
	profile_index: number;
	name: string;
	avatar_color_hex?: string;
	uses_primary_addons?: boolean;
	avatar_id?: string | null;
	avatar_url?: string | null;
}

// Addons

export interface Addon {
	id: string;
	user_id: string;
	profile_id: number;
	url: string;
	name: string | null;
	enabled: boolean;
	sort_order: number;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
}

export interface AddonInput {
	url: string;
	name?: string;
	enabled?: boolean;
	sort_order?: number;
}

// Library

export interface LibraryItem {
	id: string;
	user_id: string;
	profile_id: number;
	content_id: string;
	content_type: ContentType;
	name: string;
	poster: string | null;
	poster_shape: PosterShape;
	background: string | null;
	description: string | null;
	release_info: string | null;
	imdb_rating: number | null;
	genres: string[];
	addon_base_url: string | null;
	added_at: EpochMilliseconds;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
}

export interface LibraryItemInput {
	content_id: string;
	content_type: ContentType;
	name?: string;
	poster?: string;
	poster_shape?: PosterShape;
	background?: string;
	description?: string;
	release_info?: string;
	imdb_rating?: number;
	genres?: string[];
	addon_base_url?: string;
	added_at?: EpochMilliseconds;
}

export interface LibraryItemKey {
	content_id: string;
	content_type: ContentType;
}

export interface LibraryDeltaEvent {
	event_id: number;
	operation: SyncOperation;
	content_id: string;
	content_type: ContentType;
	name: string;
	poster: string | null;
	poster_shape: PosterShape;
	background: string | null;
	description: string | null;
	release_info: string | null;
	imdb_rating: number | null;
	genres: string[];
	addon_base_url: string | null;
	added_at: EpochMilliseconds;
}

// Watch progress

export interface WatchProgress {
	id: string;
	user_id: string;
	profile_id: number;
	content_id: string;
	content_type: ContentType;
	video_id: string;
	season: number | null;
	episode: number | null;
	progress_key: string;
	position: number;
	duration: number;
	last_watched: EpochMilliseconds;
}

export interface WatchProgressInput {
	content_id: string;
	content_type: ContentType;
	video_id: string;
	season?: number;
	episode?: number;
	position: number;
	duration: number;
	last_watched: EpochMilliseconds;
}

export interface WatchProgressDeltaEvent {
	event_id: number;
	operation: SyncOperation;
	progress_key: string;
	content_id: string;
	content_type: ContentType;
	video_id: string;
	season: number | null;
	episode: number | null;
	position: number;
	duration: number;
	last_watched: EpochMilliseconds;
}

// Watch history

export interface WatchedItem {
	id: string;
	user_id: string;
	profile_id: number;
	content_id: string;
	content_type: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watched_at: EpochMilliseconds;
	created_at: IsoTimestamp;
}

export interface WatchedItemInput {
	content_id: string;
	content_type: ContentType;
	title?: string;
	season?: number;
	episode?: number;
	watched_at: EpochMilliseconds;
}

export interface WatchedItemKey {
	content_id: string;
	season?: number;
	episode?: number;
}

export interface WatchedItemDeltaEvent {
	event_id: number;
	operation: SyncOperation;
	content_id: string;
	content_type: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watched_at: EpochMilliseconds;
}

// Profile settings and home catalog settings

export interface ProfileSettingsBlob {
	profile_id: number;
	settings_json: JsonObject;
	updated_at: IsoTimestamp;
}

export interface HomeCatalogSettings {
	id: string;
	user_id: string;
	profile_id: number;
	platform: string;
	settings_json: JsonObject;
	updated_at: IsoTimestamp;
}

// Collections

export type CollectionViewMode = "TABBED_GRID" | "ROWS" | "FOLLOW_LAYOUT";

export interface CatalogSource {
	addonId: string;
	type: string;
	catalogId: string;
}

export interface CollectionFolder {
	id: string;
	title: string;
	coverImageUrl?: string;
	coverEmoji?: string;
	tileShape?: PosterShape;
	hideTitle?: boolean;
	catalogSources?: CatalogSource[];
}

export interface Collection {
	id: string;
	title: string;
	backdropImageUrl?: string;
	pinToTop?: boolean;
	viewMode?: CollectionViewMode;
	showAllTab?: boolean;
	folders: CollectionFolder[];
}

export interface CollectionsBlob {
	profile_id: number;
	collections_json: Collection[];
	updated_at: IsoTimestamp;
}

// Avatars

export interface AvatarCatalogEntry {
	id: string;
	display_name: string;
	storage_path: string;
	category: string;
	sort_order: number;
	is_active: boolean;
	bg_color: string | null;
	created_at: IsoTimestamp;
}

// Supporter wall

export type MembershipLevel = "SUPPORTER" | "SUPPORTER_PLUS" | (string & {});

export interface SupporterMember {
	displayName: string;
	avatarUrl: string;
	membershipLevel: MembershipLevel;
	supporterSince: IsoTimestamp | null;
}

export interface SupporterList {
	members: SupporterMember[];
	totalCount: number;
}

export interface SupporterWall {
	top: SupporterList;
	recent: SupporterList;
	pagination: {
		limit: number;
		offset: number;
	};
}

export interface SupporterWallQuery {
	limit?: number;
	offset?: number;
}

// Sync overview

export type ProfileIndexedCounts = Record<string, number>;

export interface SyncOverview {
	addons: ProfileIndexedCounts;
	library_items: ProfileIndexedCounts;
	watch_progress: ProfileIndexedCounts;
	watched_items: ProfileIndexedCounts;
	profiles: Record<string, { name: string; color: string }>;
}

// Health

export type HealthStatus = "healthy" | "slow" | "degraded" | "down";

export interface HealthCheck {
	status: HealthStatus;
	database: string;
	latency_ms: number;
	timestamp: IsoTimestamp;
}

// Errors

export interface NuvioApiErrorBody {
	code?: string;
	message?: string;
	details?: string | null;
	hint?: string | null;
}

// RPC request parameter shapes

export type EmptyParams = Record<string, never>;

export interface ProfileScopedParams {
	p_profile_id?: number;
}

export interface PushProfilesParams {
	p_profiles: ProfileInput[];
	p_client_max_profiles?: number;
}

export interface DeleteProfileDataParams {
	p_profile_id: number;
}

export interface PushAddonsParams {
	p_profile_id: number;
	p_addons: AddonInput[];
}

export interface PullLibraryParams {
	p_profile_id?: number;
	p_limit?: number;
	p_offset?: number;
}

export interface PullLibraryDeltaParams {
	p_profile_id?: number;
	p_since_event_id?: number;
	p_limit?: number;
}

export interface PushLibraryItemsParams {
	p_items: LibraryItemInput[];
	p_profile_id?: number;
	p_origin_client_id?: string | null;
}

export interface DeleteLibraryItemsParams {
	p_keys: LibraryItemKey[];
	p_profile_id?: number;
	p_origin_client_id?: string | null;
}

export interface PushLibraryParams {
	p_profile_id: number;
	p_items: LibraryItemInput[];
}

export interface PullWatchProgressParams {
	p_profile_id?: number;
	p_since_last_watched?: EpochMilliseconds | null;
	p_limit?: number;
}

export interface PullWatchProgressDeltaParams {
	p_profile_id?: number;
	p_since_event_id?: number;
	p_limit?: number;
}

export interface PushWatchProgressParams {
	p_entries: WatchProgressInput[];
	p_profile_id?: number;
}

export type DeleteWatchProgressParams =
	| { p_progress_key: string; p_profile_id?: number; p_keys?: never }
	| { p_keys: string[]; p_profile_id?: number; p_progress_key?: never };

export interface PullWatchedItemsParams {
	p_profile_id?: number;
	p_page?: number;
	p_page_size?: number;
}

export interface PullWatchedItemsDeltaParams {
	p_profile_id?: number;
	p_since_event_id?: number;
	p_limit?: number;
}

export interface PushWatchedItemsParams {
	p_items: WatchedItemInput[];
	p_profile_id?: number;
}

export interface DeleteWatchedItemsParams {
	p_keys: WatchedItemKey[];
	p_profile_id?: number;
}

export interface PullSettingsBlobParams {
	p_profile_id: number;
	p_platform?: Platform;
}

export interface PushSettingsBlobParams {
	p_profile_id: number;
	p_settings_json: JsonObject;
	p_platform?: Platform;
}

export interface PullHomeCatalogSettingsParams {
	p_profile_id: number;
	p_platform?: Platform;
}

export interface PushHomeCatalogSettingsParams {
	p_profile_id: number;
	p_settings_json: JsonObject;
	p_platform?: Platform;
}

export interface PullCollectionsParams {
	p_profile_id: number;
}

export interface PushCollectionsParams {
	p_profile_id: number;
	p_collections_json: Collection[];
}

/**
 * Maps every documented RPC function to its request parameters and result type.
 * Used by {@link NuvioClient.rpc} to type calls by function name alone.
 */
export interface NuvioRpcMap {
	sync_pull_profiles: { params: EmptyParams; result: Profile[] };
	sync_push_profiles: { params: PushProfilesParams; result: void };
	sync_delete_profile_data: { params: DeleteProfileDataParams; result: void };
	sync_push_addons: { params: PushAddonsParams; result: void };
	sync_pull_library: { params: PullLibraryParams; result: LibraryItem[] };
	sync_get_library_delta_cursor: {
		params: ProfileScopedParams;
		result: number;
	};
	sync_pull_library_delta: {
		params: PullLibraryDeltaParams;
		result: LibraryDeltaEvent[];
	};
	sync_push_library_items: { params: PushLibraryItemsParams; result: void };
	sync_delete_library_items: { params: DeleteLibraryItemsParams; result: void };
	sync_push_library: { params: PushLibraryParams; result: void };
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
	sync_push_watch_progress: { params: PushWatchProgressParams; result: void };
	sync_delete_watch_progress: {
		params: DeleteWatchProgressParams;
		result: void;
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
	sync_push_watched_items: { params: PushWatchedItemsParams; result: void };
	sync_delete_watched_items: { params: DeleteWatchedItemsParams; result: void };
	sync_pull_profile_settings_blob: {
		params: PullSettingsBlobParams;
		result: ProfileSettingsBlob[];
	};
	sync_push_profile_settings_blob: {
		params: PushSettingsBlobParams;
		result: void;
	};
	sync_pull_home_catalog_settings: {
		params: PullHomeCatalogSettingsParams;
		result: HomeCatalogSettings[];
	};
	sync_push_home_catalog_settings: {
		params: PushHomeCatalogSettingsParams;
		result: void;
	};
	sync_pull_collections: {
		params: PullCollectionsParams;
		result: CollectionsBlob[];
	};
	sync_push_collections: { params: PushCollectionsParams; result: void };
	get_avatar_catalog: { params: EmptyParams; result: AvatarCatalogEntry[] };
	get_sync_overview: { params: EmptyParams; result: SyncOverview };
	health_ping: { params: EmptyParams; result: boolean };
}

export type RpcName = keyof NuvioRpcMap;
export type RpcParams<Name extends RpcName> = NuvioRpcMap[Name]["params"];
export type RpcResult<Name extends RpcName> = NuvioRpcMap[Name]["result"];

/** RPC functions that are callable without an access token. */
export type UnauthenticatedRpcName = "get_avatar_catalog" | "health_ping";
