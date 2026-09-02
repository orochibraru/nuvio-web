import type {
	Addon,
	AuthSession,
	AvatarCatalogEntry,
	CollectionsBlob,
	DeleteLibraryItemsParams,
	EmailPasswordCredentials,
	HealthCheck,
	HomeCatalogSettings,
	LibraryDeltaEvent,
	LibraryItem,
	NuvioApiErrorBody,
	NuvioUser,
	Profile,
	ProfileSettingsBlob,
	PullCollectionsParams,
	PullHomeCatalogSettingsParams,
	PullLibraryDeltaParams,
	PullLibraryParams,
	PullSettingsBlobParams,
	PullWatchedItemsDeltaParams,
	PullWatchedItemsParams,
	PullWatchProgressDeltaParams,
	PullWatchProgressParams,
	PushAddonsParams,
	PushCollectionsParams,
	PushHomeCatalogSettingsParams,
	PushLibraryItemsParams,
	PushLibraryParams,
	PushProfilesParams,
	PushSettingsBlobParams,
	PushWatchedItemsParams,
	PushWatchProgressParams,
	RpcArgs,
	RpcName,
	RpcResult,
	SupporterWall,
	SupporterWallQuery,
	SyncOverview,
	UnauthenticatedRpcName,
	WatchedItem,
	WatchedItemDeltaEvent,
	WatchedItemKey,
	WatchProgress,
	WatchProgressDeltaEvent,
} from "./types.ts";

export const NUVIO_BASE_URL = "https://api.nuvio.tv";
export const NUVIO_WEBSITE_URL = "https://nuvio.tv";
export const NUVIO_PUBLISHABLE_KEY =
	"sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";

const UNAUTHENTICATED_RPC: ReadonlySet<UnauthenticatedRpcName> = new Set([
	"get_avatar_catalog",
	"health_ping",
]);

/** Error thrown for any non-2xx response from the Nuvio API. */
export class NuvioApiError extends Error {
	readonly status: number;
	readonly code: string | null;
	readonly details: string | null;
	readonly hint: string | null;

	constructor(
		status: number,
		body: NuvioApiErrorBody,
		fallbackMessage: string,
	) {
		super(body.message || fallbackMessage);
		this.name = "NuvioApiError";
		this.status = status;
		this.code = body.code ?? null;
		this.details = body.details ?? null;
		this.hint = body.hint ?? null;
	}

	static async fromResponse(response: Response): Promise<NuvioApiError> {
		let body: NuvioApiErrorBody = {};
		const raw = await response.text().catch(() => "");
		if (raw) {
			try {
				body = JSON.parse(raw) as NuvioApiErrorBody;
			} catch {
				body = { message: raw };
			}
		}
		return new NuvioApiError(
			response.status,
			body,
			`Nuvio request failed with status ${response.status}`,
		);
	}
}

type FetchImplementation = typeof fetch;

export interface NuvioClientOptions {
	baseUrl?: string;
	websiteUrl?: string;
	publishableKey?: string;
	fetch?: FetchImplementation;
	session?: AuthSession | null;
	onSessionChange?: (session: AuthSession | null) => void;
	/** Per-request timeout in ms. Default {@link DEFAULT_REQUEST_TIMEOUT_MS}. */
	requestTimeoutMs?: number;
}

interface HttpOptions extends Omit<RequestInit, "headers"> {
	headers?: Record<string, string>;
	skipAuth?: boolean;
}

/**
 * Hard ceiling on every API call. Without it a stalled socket or a Cloudflare
 * hold (the API rate-limits with a 1015 that can hang the connection) leaves the
 * `await` pending forever : and any `+page.server.ts` load waiting on it blocks
 * the navigation that triggered it.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

/**
 * Typed client for the Nuvio public API.
 *
 * Every documented endpoint is reachable through a named helper. The generic
 * {@link NuvioClient.rpc} method is the escape hatch for calling any RPC by name
 * with parameters and result inferred from {@link NuvioRpcMap}.
 */
export class NuvioClient {
	readonly baseUrl: string;
	readonly websiteUrl: string;
	readonly publishableKey: string;

	private readonly fetchImplementation: FetchImplementation;
	private readonly onSessionChange?: (session: AuthSession | null) => void;
	private readonly requestTimeoutMs: number;
	private currentSession: AuthSession | null;

	constructor(options: NuvioClientOptions = {}) {
		this.baseUrl = (options.baseUrl ?? NUVIO_BASE_URL).replace(/\/$/, "");
		this.websiteUrl = (options.websiteUrl ?? NUVIO_WEBSITE_URL).replace(
			/\/$/,
			"",
		);
		this.publishableKey = options.publishableKey ?? NUVIO_PUBLISHABLE_KEY;
		this.fetchImplementation = options.fetch ?? globalThis.fetch;
		this.currentSession = options.session ?? null;
		this.onSessionChange = options.onSessionChange;
		this.requestTimeoutMs =
			options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	}

	get session(): AuthSession | null {
		return this.currentSession;
	}

	/**
	 * A clone bound to a different `fetch` : used by `+page.server.ts` loads so
	 * every upstream call goes through the request-scoped `fetch` SvelteKit hands
	 * the load (never a `fetch` captured earlier). Shares the current session but
	 * not the cookie writer, so it is read-only by design.
	 */
	withFetch(fetch: FetchImplementation): NuvioClient {
		return new NuvioClient({
			baseUrl: this.baseUrl,
			websiteUrl: this.websiteUrl,
			publishableKey: this.publishableKey,
			fetch,
			session: this.currentSession,
			requestTimeoutMs: this.requestTimeoutMs,
		});
	}

	setSession(session: AuthSession | null): void {
		this.currentSession = session;
		this.onSessionChange?.(session);
	}

	/** Call any Nuvio RPC by name. Parameters and result are inferred from the function name. */
	async rpc<Name extends RpcName>(
		fn: Name,
		...args: RpcArgs<Name>
	): Promise<RpcResult<Name>> {
		const params = args[0] ?? {};
		return await this.http<RpcResult<Name>>(
			`${this.baseUrl}/rest/v1/rpc/${fn}`,
			{
				method: "POST",
				body: JSON.stringify(params),
				skipAuth: UNAUTHENTICATED_RPC.has(fn as UnauthenticatedRpcName),
			},
		);
	}

	// Authentication

	async signUp(credentials: EmailPasswordCredentials): Promise<AuthSession> {
		return await this.authenticate(
			`${this.baseUrl}/auth/v1/signup`,
			credentials,
		);
	}

	async signInWithPassword(
		credentials: EmailPasswordCredentials,
	): Promise<AuthSession> {
		return await this.authenticate(
			`${this.baseUrl}/auth/v1/token?grant_type=password`,
			credentials,
		);
	}

	async refreshSession(refreshToken?: string): Promise<AuthSession> {
		const token = refreshToken ?? this.currentSession?.refresh_token;
		if (!token) {
			throw new NuvioApiError(
				400,
				{ message: "No refresh token available" },
				"No refresh token available",
			);
		}
		return await this.authenticate(
			`${this.baseUrl}/auth/v1/token?grant_type=refresh_token`,
			{
				refresh_token: token,
			},
		);
	}

	async signOut(): Promise<void> {
		if (this.currentSession) {
			await this.http<void>(`${this.baseUrl}/auth/v1/logout`, {
				method: "POST",
			});
		}
		this.setSession(null);
	}

	async getUser(): Promise<NuvioUser> {
		return await this.http<NuvioUser>(`${this.baseUrl}/auth/v1/user`, {
			method: "GET",
		});
	}

	// Profiles

	readonly profiles = {
		list: (): Promise<Profile[]> => this.rpc("sync_pull_profiles"),
		replace: (params: PushProfilesParams): Promise<void> =>
			this.rpc("sync_push_profiles", params),
		deleteData: (profileId: number): Promise<void> =>
			this.rpc("sync_delete_profile_data", { p_profile_id: profileId }),
	};

	// Addons

	readonly addons = {
		list: (profileId: number): Promise<Addon[]> => {
			const query = new URLSearchParams({
				select: "*",
				profile_id: `eq.${profileId}`,
				order: "sort_order",
			});
			return this.http<Addon[]>(`${this.baseUrl}/rest/v1/addons?${query}`, {
				method: "GET",
			});
		},
		replace: (params: PushAddonsParams): Promise<void> =>
			this.rpc("sync_push_addons", params),
	};

	// Library

	readonly library = {
		pull: (params: PullLibraryParams = {}): Promise<LibraryItem[]> =>
			this.rpc("sync_pull_library", params),
		deltaCursor: (profileId?: number): Promise<number> =>
			this.rpc("sync_get_library_delta_cursor", profileScope(profileId)),
		pullDelta: (
			params: PullLibraryDeltaParams = {},
		): Promise<LibraryDeltaEvent[]> =>
			this.rpc("sync_pull_library_delta", params),
		upsertItems: (params: PushLibraryItemsParams): Promise<void> =>
			this.rpc("sync_push_library_items", params),
		deleteItems: (params: DeleteLibraryItemsParams): Promise<void> =>
			this.rpc("sync_delete_library_items", params),
		replaceLegacy: (params: PushLibraryParams): Promise<void> =>
			this.rpc("sync_push_library", params),
	};

	// Watch progress

	readonly watchProgress = {
		pull: (params: PullWatchProgressParams = {}): Promise<WatchProgress[]> =>
			this.rpc("sync_pull_watch_progress", params),
		pullDelta: (
			params: PullWatchProgressDeltaParams = {},
		): Promise<WatchProgressDeltaEvent[]> =>
			this.rpc("sync_pull_watch_progress_delta", params),
		deltaCursor: (profileId?: number): Promise<number> =>
			this.rpc("sync_get_watch_progress_delta_cursor", profileScope(profileId)),
		push: (params: PushWatchProgressParams): Promise<void> =>
			this.rpc("sync_push_watch_progress", params),
		delete: (progressKey: string, profileId?: number): Promise<void> =>
			this.rpc("sync_delete_watch_progress", {
				p_progress_key: progressKey,
				...profileScope(profileId),
			}),
		deleteMany: (progressKeys: string[], profileId?: number): Promise<void> =>
			this.rpc("sync_delete_watch_progress", {
				p_keys: progressKeys,
				...profileScope(profileId),
			}),
	};

	// Watch history

	readonly watchHistory = {
		pull: (params: PullWatchedItemsParams = {}): Promise<WatchedItem[]> =>
			this.rpc("sync_pull_watched_items", params),
		pullDelta: (
			params: PullWatchedItemsDeltaParams = {},
		): Promise<WatchedItemDeltaEvent[]> =>
			this.rpc("sync_pull_watched_items_delta", params),
		deltaCursor: (profileId?: number): Promise<number> =>
			this.rpc("sync_get_watched_items_delta_cursor", profileScope(profileId)),
		push: (params: PushWatchedItemsParams): Promise<void> =>
			this.rpc("sync_push_watched_items", params),
		delete: (keys: WatchedItemKey[], profileId?: number): Promise<void> =>
			this.rpc("sync_delete_watched_items", {
				p_keys: keys,
				...profileScope(profileId),
			}),
	};

	// Profile settings

	readonly settings = {
		pull: (params: PullSettingsBlobParams): Promise<ProfileSettingsBlob[]> =>
			this.rpc("sync_pull_profile_settings_blob", params),
		replace: (params: PushSettingsBlobParams): Promise<void> =>
			this.rpc("sync_push_profile_settings_blob", params),
	};

	// Home catalog settings

	readonly homeCatalog = {
		pull: (
			params: PullHomeCatalogSettingsParams,
		): Promise<HomeCatalogSettings[]> =>
			this.rpc("sync_pull_home_catalog_settings", params),
		replace: (params: PushHomeCatalogSettingsParams): Promise<void> =>
			this.rpc("sync_push_home_catalog_settings", params),
	};

	// Collections

	readonly collections = {
		pull: (profileId: number): Promise<CollectionsBlob[]> =>
			this.rpc("sync_pull_collections", {
				p_profile_id: profileId,
			} satisfies PullCollectionsParams),
		replace: (params: PushCollectionsParams): Promise<void> =>
			this.rpc("sync_push_collections", params),
	};

	// Avatars, overview, health

	listAvatars(): Promise<AvatarCatalogEntry[]> {
		return this.rpc("get_avatar_catalog");
	}

	/** Public URL for a catalog avatar's `storage_path`. */
	avatarUrl(storagePath: string): string {
		return `${this.baseUrl}/storage/v1/object/public/avatars/${storagePath}`;
	}

	getSyncOverview(): Promise<SyncOverview> {
		return this.rpc("get_sync_overview");
	}

	healthPing(): Promise<boolean> {
		return this.rpc("health_ping");
	}

	async healthCheck(): Promise<HealthCheck> {
		const response = await this.fetchImplementation(
			`${this.baseUrl}/functions/v1/health-check`,
		);
		if (!response.ok) {
			throw await NuvioApiError.fromResponse(response);
		}
		return (await response.json()) as HealthCheck;
	}

	async getSupporterWall(
		query: SupporterWallQuery = {},
	): Promise<SupporterWall> {
		const search = new URLSearchParams();
		if (query.limit !== undefined) {
			search.set("limit", String(query.limit));
		}
		if (query.offset !== undefined) {
			search.set("offset", String(query.offset));
		}
		const suffix = search.toString() ? `?${search}` : "";
		const response = await this.fetchImplementation(
			`${this.websiteUrl}/api/supporters/wall${suffix}`,
		);
		if (!response.ok) {
			throw await NuvioApiError.fromResponse(response);
		}
		return (await response.json()) as SupporterWall;
	}

	// Internals

	private async authenticate(url: string, body: unknown): Promise<AuthSession> {
		const session = await this.http<AuthSession>(url, {
			method: "POST",
			body: JSON.stringify(body),
			skipAuth: true,
		});
		this.setSession(session);
		return session;
	}

	private async http<T>(url: string, options: HttpOptions = {}): Promise<T> {
		const { skipAuth, headers, ...init } = options;
		const requestHeaders: Record<string, string> = {
			apikey: this.publishableKey,
			...(init.body === undefined
				? {}
				: { "content-type": "application/json" }),
			...headers,
		};
		if (!skipAuth && this.currentSession) {
			requestHeaders.authorization = `Bearer ${this.currentSession.access_token}`;
		}

		// Bound every call. Merge with a caller-supplied signal when present so an
		// aborted navigation still tears the request down.
		const timeout = AbortSignal.timeout(this.requestTimeoutMs);
		const signal =
			init.signal instanceof AbortSignal
				? AbortSignal.any([init.signal, timeout])
				: timeout;

		let response: Response;
		try {
			response = await this.fetchImplementation(url, {
				...init,
				headers: requestHeaders,
				signal,
			});
		} catch (cause) {
			if (timeout.aborted) {
				throw new NuvioApiError(
					408,
					{ message: `Request to ${url} timed out` },
					"The Nuvio API did not respond in time.",
				);
			}
			throw cause;
		}
		if (!response.ok) {
			throw await NuvioApiError.fromResponse(response);
		}
		if (response.status === 204) {
			return undefined as T;
		}
		const text = await response.text();
		return (text ? JSON.parse(text) : undefined) as T;
	}
}

function profileScope(profileId?: number): { p_profile_id?: number } {
	return profileId === undefined ? {} : { p_profile_id: profileId };
}
