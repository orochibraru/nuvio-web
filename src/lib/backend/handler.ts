import * as v from "valibot";
import { normalizeEmail } from "#lib/admin/admin-data.js";
import {
	backendPolicy,
	emailConfirmationRequired,
} from "#lib/admin/backends-data.js";
import type { LocalBackend, NuvioBackend } from "#lib/nuvio/backend.js";
import type { AdminService } from "#lib/services/admin.service.js";
import type { DatabaseService } from "#lib/services/database.service.js";
import type { Logger } from "#lib/services/logger.service.js";
import type { MailerService } from "#lib/services/mailer.service.js";
import type { RateLimiter } from "#lib/services/rate-limit.service.js";
import { BackendAccounts } from "./accounts.ts";
import { BackendAuth, type Caller, type MailLinks } from "./auth.ts";
import { avatarSvg } from "./avatars.ts";
import {
	issueMessage,
	json,
	notFound,
	readBody,
	restError,
	safeEqual,
} from "./http.ts";
import { RPCS } from "./rpc.ts";
import { BackendStore } from "./store.ts";

/** Where the backend is mounted: its base URL is `<origin>/api/nuvio`. */
export const BUILT_IN_MOUNT = "/api/nuvio";

const AVATAR_PREFIX = "storage/v1/object/public/avatars/";
const SLOW_DATABASE_MS = 1000;
const ALLOWED_HEADERS =
	"authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version, range";

export interface BuiltInSummary {
	url: string;
	publishableKey: string;
	accounts: number;
	isDefault: boolean;
	hasAccount: boolean;
	confirmEmail: boolean;
}

interface Collaborators {
	limiter: RateLimiter;
	admin: AdminService;
	logger: Logger;
	mailer: Pick<MailerService, "settings" | "send">;
	/** The app's pathnames an emailed link opens. */
	pages: MailLinks;
}

const addonsQuery = v.object({
	select: v.optional(v.literal("*")),
	profile_id: v.optional(v.pipe(v.string(), v.regex(/^eq\.[1-9]\d{0,5}$/))),
	order: v.optional(v.picklist(["sort_order", "sort_order.asc"])),
});

function preflight(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			"access-control-allow-methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
			"access-control-allow-headers": ALLOWED_HEADERS,
			"access-control-max-age": "86400",
		},
	});
}

/**
 * This server as a Nuvio backend: the same HTTP API as api.nuvio.tv (a
 * Supabase project), answered from its own SQLite. Its auth is its own
 * (`apikey` plus a bearer JWT), never the app's session cookie.
 *
 * Singleton: it holds the derived signing key and the cached publishable key.
 */
export class BuiltInBackend implements LocalBackend {
	readonly #accounts: BackendAccounts;
	readonly #auth: BackendAuth;
	readonly #store: BackendStore;
	#publishableKey: string | null = null;

	constructor(
		database: Pick<DatabaseService, "connect">,
		secret: string,
		private readonly collaborators: Collaborators,
		private readonly now: () => number = Date.now,
	) {
		this.#accounts = new BackendAccounts(database, secret, now);
		this.#store = new BackendStore(database, now);
		this.#auth = new BackendAuth(
			this.#accounts,
			secret,
			{
				limiter: collaborators.limiter,
				admin: collaborators.admin,
				db: () => this.#store.db(),
				mailer: collaborators.mailer,
				mailLinks: () => this.#mailLinks(),
				eraseData: (userId) => this.#store.deleteUserData(userId),
			},
			now,
		);
	}

	/**
	 * On the origin the admin saved this backend as the default from, never
	 * the request's: a forged `Host` must not put its own address in the email.
	 */
	#mailLinks(): MailLinks | null {
		const fallback = backendPolicy(this.#store.db()).defaultBackend;
		if (
			!(fallback && this.owns(fallback)) ||
			this.collaborators.mailer.settings() === null
		) {
			return null;
		}
		const origin = new URL(fallback.url).origin;
		return {
			resetPassword: `${origin}${this.collaborators.pages.resetPassword}`,
			confirmEmail: `${origin}${this.collaborators.pages.confirmEmail}`,
		};
	}

	/** Whether this backend can email a link: SMTP set up and it is the instance default. */
	canSendMail(): boolean {
		return this.#mailLinks() !== null;
	}

	/** Calls the handler in-process: what a client for this instance's own default uses. */
	readonly fetch = ((input: string | URL | Request, init?: RequestInit) =>
		this.handle(new Request(input, init), null)) as typeof fetch;

	publishableKey(): string {
		this.#publishableKey ??= this.#accounts.publishableKey();
		return this.#publishableKey;
	}

	/** The admin's default backend pointing at this very instance, by mount path and key. */
	owns(backend: NuvioBackend): boolean {
		if (!(backend.trusted && URL.canParse(backend.url))) {
			return false;
		}
		try {
			return (
				new URL(backend.url).pathname === BUILT_IN_MOUNT &&
				safeEqual(backend.publishableKey, this.publishableKey())
			);
		} catch {
			return false;
		}
	}

	/** Whether the request's session signed in through this backend. */
	ownsSession(locals: Pick<App.Locals, "session" | "nuvio">): boolean {
		return (
			locals.session !== null &&
			this.owns({
				url: locals.nuvio.baseUrl,
				publishableKey: locals.nuvio.publishableKey,
				trusted: locals.session.trusted,
			})
		);
	}

	summary(origin: string, adminEmail: string): BuiltInSummary {
		const policy = backendPolicy(this.#store.db());
		return {
			url: `${origin}${BUILT_IN_MOUNT}`,
			publishableKey: this.publishableKey(),
			accounts: this.#accounts.countUsers(),
			isDefault:
				policy.defaultBackend !== null && this.owns(policy.defaultBackend),
			hasAccount:
				this.#accounts.userByEmail(normalizeEmail(adminEmail)) !== null,
			confirmEmail: emailConfirmationRequired(this.#store.db()),
		};
	}

	createAccount(email: string, password: string): Promise<boolean> {
		return this.#auth.createAccount(email, password);
	}

	/** `clientAddress` is null in-process: the app already throttled the caller by address. */
	async handle(request: Request, clientAddress: string | null) {
		let response: Response;
		try {
			response = await this.#route(request, clientAddress);
		} catch (error) {
			this.collaborators.logger.error("Built-in backend request failed", {
				error: error instanceof Error ? error : "Unknown error",
			});
			response = restError(500, "XX000", "Internal server error");
		}
		response.headers.set("access-control-allow-origin", "*");
		return response;
	}

	#route(request: Request, address: string | null): Promise<Response> {
		const pathname = new URL(request.url).pathname;
		const mount = pathname.indexOf(`${BUILT_IN_MOUNT}/`);
		const path =
			mount < 0 ? "" : pathname.slice(mount + BUILT_IN_MOUNT.length + 1);
		const read = request.method === "GET" || request.method === "HEAD";
		if (request.method === "OPTIONS") {
			return Promise.resolve(preflight());
		}
		if (path === "functions/v1/health-check" && read) {
			return Promise.resolve(this.#healthCheck());
		}
		if (path.startsWith(AVATAR_PREFIX) && read) {
			return Promise.resolve(this.#avatar(path.slice(AVATAR_PREFIX.length)));
		}
		const area = path.slice(0, "auth/v1/".length);
		if (area !== "auth/v1/" && area !== "rest/v1/") {
			return Promise.resolve(notFound());
		}
		const keyProblem = this.#checkApiKey(request);
		if (keyProblem) {
			return Promise.resolve(keyProblem);
		}
		const rest = path.slice(area.length);
		return area === "auth/v1/"
			? this.#auth.handle(request, rest, {
					publishableKey: this.publishableKey(),
					address,
				})
			: this.#rest(request, rest);
	}

	#checkApiKey(request: Request): Response | null {
		const given =
			request.headers.get("apikey") ??
			new URL(request.url).searchParams.get("apikey");
		if (!given) {
			return json(401, {
				message: "No API key found in request",
				hint: "No `apikey` request header or url param was found.",
			});
		}
		if (!safeEqual(given, this.publishableKey())) {
			return json(401, {
				message: "Invalid API key",
				hint: "Double check your Supabase `anon` or `service_role` API key.",
			});
		}
		return null;
	}

	// REST (PostgREST)

	async #rest(request: Request, path: string): Promise<Response> {
		const caller = this.#auth.caller(request, this.publishableKey());
		if (caller.kind === "invalid") {
			return caller.reason === "expired"
				? restError(401, "PGRST303", "JWT expired")
				: restError(401, "PGRST301", "JWT could not be verified");
		}
		if (path === "addons") {
			return request.method === "GET"
				? this.#addons(request, caller)
				: restError(
						405,
						"PGRST117",
						`Unsupported HTTP method: ${request.method}`,
					);
		}
		if (!path.startsWith("rpc/")) {
			return restError(
				404,
				"PGRST205",
				"Could not find the table in the schema cache",
			);
		}
		if (request.method !== "POST") {
			return restError(
				405,
				"PGRST117",
				`Unsupported HTTP method: ${request.method}`,
			);
		}
		return await this.#rpc(request, path.slice("rpc/".length), caller);
	}

	async #rpc(request: Request, name: string, caller: Caller) {
		const rpc = RPCS.get(name);
		if (!rpc) {
			return restError(
				404,
				"PGRST202",
				"Could not find the function in the schema cache",
			);
		}
		if (rpc.authenticated && caller.kind !== "user") {
			return restError(401, "42501", "permission denied for function");
		}
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const outcome = rpc.call(
			{
				store: this.#store,
				userId: caller.kind === "user" ? caller.claims.sub : "",
				now: this.now(),
			},
			body.value,
		);
		if (!outcome.ok) {
			return restError(400, "22023", issueMessage(outcome.issues));
		}
		return outcome.result === undefined
			? new Response(null, { status: 204 })
			: json(200, outcome.result);
	}

	#addons(request: Request, caller: Caller): Response {
		if (caller.kind !== "user") {
			return restError(401, "42501", "permission denied for table addons");
		}
		const search = new URL(request.url).searchParams;
		search.delete("apikey");
		const keys = [...search.keys()];
		const query = v.safeParse(addonsQuery, Object.fromEntries(search));
		if (
			!query.success ||
			new Set(keys).size !== keys.length ||
			keys.some((key) => !(key in addonsQuery.entries))
		) {
			return restError(400, "PGRST100", "Unsupported query for addons");
		}
		const profileId = query.output.profile_id
			? Number(query.output.profile_id.slice("eq.".length))
			: null;
		const rows = this.#store.addons(caller.claims.sub, profileId);
		return json(200, rows, {
			"content-range": rows.length ? `0-${rows.length - 1}/*` : "*/0",
		});
	}

	// Public, no apikey: an `<img>` and a probe can't send one.

	#healthCheck(): Response {
		const started = performance.now();
		let connected = true;
		try {
			this.#store.db().query("SELECT 1").get();
		} catch {
			connected = false;
		}
		const latency = Math.round(performance.now() - started);
		const status = latency > SLOW_DATABASE_MS ? "slow" : "healthy";
		return json(connected ? 200 : 503, {
			status: connected ? status : "down",
			database: connected ? "connected" : "disconnected",
			latency_ms: latency,
			timestamp: new Date(this.now()).toISOString(),
		});
	}

	#avatar(path: string): Response {
		const svg = avatarSvg(path);
		if (svg === null) {
			return json(404, {
				statusCode: "404",
				error: "not_found",
				message: "Object not found",
			});
		}
		return new Response(svg, {
			headers: {
				"content-type": "image/svg+xml",
				"cache-control": "public, max-age=86400",
				"content-security-policy":
					"default-src 'none'; style-src 'unsafe-inline'",
			},
		});
	}
}
