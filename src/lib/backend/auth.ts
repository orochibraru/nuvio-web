import type { Database } from "bun:sqlite";
import * as v from "valibot";
import { canSignIn, normalizeEmail } from "#lib/admin/admin-data.js";
import type { AdminService } from "#lib/services/admin.service.js";
import type { RateLimiter } from "#lib/services/rate-limit.service.js";
import type {
	BackendAccounts,
	BackendUser,
	IssuedSession,
} from "./accounts.ts";
import {
	authError,
	bearerOf,
	json,
	notFound,
	readBody,
	safeEqual,
} from "./http.ts";
import {
	ACCESS_TOKEN_SECONDS,
	type AccessClaims,
	deriveSigningKey,
	signAccessToken,
	verifyAccessToken,
} from "./jwt.ts";
import { isoTime } from "./store.ts";

const MIN_PASSWORD_LENGTH = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_PER_ADDRESS = 10;
const ATTEMPTS_PER_EMAIL = 5;

export type Caller =
	| { kind: "anonymous" }
	| { kind: "user"; claims: AccessClaims }
	| { kind: "invalid"; reason: "invalid" | "expired" };

export interface AuthPolicy {
	limiter: RateLimiter;
	admin: AdminService;
	/** The instance database, for the lock and the allowlist. */
	db: () => Database;
}

const credentialsSchema = v.object({
	email: v.pipe(v.string(), v.maxLength(254)),
	password: v.pipe(v.string(), v.maxLength(1024)),
});
const emailSchema = v.pipe(v.string(), v.email());
const refreshSchema = v.object({
	refresh_token: v.pipe(v.string(), v.nonEmpty(), v.maxLength(512)),
});

const SETTINGS = {
	external: { email: true, phone: false, anonymous_users: false },
	disable_signup: false,
	mailer_autoconfirm: true,
	phone_autoconfirm: false,
	sms_provider: "",
	saml_enabled: false,
};

function userView(user: BackendUser) {
	const created = isoTime(user.created_at);
	return {
		id: user.id,
		aud: "authenticated",
		role: "authenticated",
		email: user.email,
		email_confirmed_at: created,
		phone: "",
		confirmed_at: created,
		last_sign_in_at:
			user.last_sign_in_at === null ? null : isoTime(user.last_sign_in_at),
		app_metadata: { provider: "email", providers: ["email"] },
		user_metadata: {},
		identities: [],
		created_at: created,
		updated_at: isoTime(user.updated_at),
		is_anonymous: false,
	};
}

function hashPassword(password: string): Promise<string> {
	return globalThis.Bun.password.hash(password);
}

/** The GoTrue half of the built-in backend: `auth/v1`, and who a bearer token is. */
export class BackendAuth {
	readonly #signingKey: Buffer;
	#dummyHash: Promise<string> | null = null;

	constructor(
		private readonly accounts: BackendAccounts,
		secret: string,
		private readonly policy: AuthPolicy,
		private readonly now: () => number = Date.now,
	) {
		this.#signingKey = deriveSigningKey(secret);
	}

	/** Anonymous without a token, or with the publishable key as one (what supabase-js sends). */
	caller(request: Request, publishableKey: string): Caller {
		const token = bearerOf(request);
		if (token === null || safeEqual(token, publishableKey)) {
			return { kind: "anonymous" };
		}
		const verified = verifyAccessToken(
			this.#signingKey,
			token,
			Math.floor(this.now() / 1000),
		);
		if (!verified.ok) {
			return { kind: "invalid", reason: verified.reason };
		}
		const { claims } = verified;
		return this.accounts.sessionExists(claims.session_id, claims.sub)
			? { kind: "user", claims }
			: { kind: "invalid", reason: "invalid" };
	}

	/** For the admin page: an admin's email can't sign up through the API (see `#signUp`). */
	async createAccount(email: string, password: string): Promise<boolean> {
		const hash = await hashPassword(password);
		return this.accounts.createUser(normalizeEmail(email), hash) !== null;
	}

	handle(
		request: Request,
		path: string,
		context: { publishableKey: string; address: string | null },
	): Promise<Response> {
		const route = `${request.method} ${path}`;
		const grant = new URL(request.url).searchParams.get("grant_type");
		if (route === "POST signup") {
			return this.#signUp(request, context.address);
		}
		if (route === "POST token" && grant === "password") {
			return this.#passwordGrant(request, context.address);
		}
		if (route === "POST token" && grant === "refresh_token") {
			return this.#refreshGrant(request);
		}
		if (route === "POST token") {
			return Promise.resolve(
				authError(400, "unsupported_grant_type", "Unsupported grant type"),
			);
		}
		if (route === "POST logout") {
			return Promise.resolve(this.#logout(request, context.publishableKey));
		}
		if (route === "GET user") {
			return Promise.resolve(this.#user(request, context.publishableKey));
		}
		return Promise.resolve(
			route === "GET settings" ? json(200, SETTINGS) : notFound(),
		);
	}

	async #credentials(
		request: Request,
		address: string | null,
	): Promise<{ email: string; password: string } | Response> {
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(credentialsSchema, body.value);
		if (!parsed.success) {
			return authError(400, "validation_failed", "Email and password required");
		}
		const email = normalizeEmail(parsed.output.email);
		const { limiter } = this.policy;
		const allowed =
			(address === null ||
				limiter.attempt(
					`backend-address:${address}`,
					ATTEMPTS_PER_ADDRESS,
					ATTEMPT_WINDOW_MS,
				)) &&
			limiter.attempt(
				`backend-email:${email}`,
				ATTEMPTS_PER_EMAIL,
				ATTEMPT_WINDOW_MS,
			);
		if (!allowed) {
			return authError(
				429,
				"over_request_rate_limit",
				"Request rate limit reached",
			);
		}
		return { email, password: parsed.output.password };
	}

	async #signUp(request: Request, address: string | null) {
		const credentials = await this.#credentials(request, address);
		if (credentials instanceof Response) {
			return credentials;
		}
		const { email, password } = credentials;
		if (!v.is(emailSchema, email)) {
			return authError(
				400,
				"validation_failed",
				"Unable to validate email address: invalid format",
			);
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return authError(
				422,
				"weak_password",
				`Password should be at least ${MIN_PASSWORD_LENGTH} characters.`,
			);
		}
		// No email confirmation here, so an admin address could be claimed by
		// anyone: admins create theirs from the admin page instead.
		if (
			this.policy.admin.isAdmin(email, true) ||
			!canSignIn(this.policy.db(), email, false)
		) {
			return authError(
				403,
				"signup_disabled",
				"Signups not allowed for this instance",
			);
		}
		const user = this.accounts.createUser(email, await hashPassword(password));
		if (!user) {
			return authError(422, "user_already_exists", "User already registered");
		}
		return this.#signedIn(user, this.accounts.createSession(user.id));
	}

	async #passwordGrant(request: Request, address: string | null) {
		const credentials = await this.#credentials(request, address);
		if (credentials instanceof Response) {
			return credentials;
		}
		const { email, password } = credentials;
		// Before the password, so a locked instance is no oracle for it.
		if (!this.#mayUse(email)) {
			return authError(403, "access_denied", "Not allowed on this instance");
		}
		const user = this.accounts.userByEmail(email);
		this.#dummyHash ??= hashPassword("built-in backend timing filler");
		const valid = await globalThis.Bun.password.verify(
			password,
			user?.password_hash ?? (await this.#dummyHash),
		);
		if (!(user && valid)) {
			return authError(400, "invalid_credentials", "Invalid login credentials");
		}
		return this.#signedIn(user, this.accounts.createSession(user.id));
	}

	async #refreshGrant(request: Request) {
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(refreshSchema, body.value);
		if (!parsed.success) {
			return authError(400, "validation_failed", "Refresh token required");
		}
		const outcome = this.accounts.rotateRefreshToken(
			parsed.output.refresh_token,
		);
		if (outcome.status === "reused") {
			return authError(
				400,
				"refresh_token_already_used",
				"Invalid Refresh Token: Already Used",
			);
		}
		if (outcome.status === "expired") {
			return authError(
				400,
				"session_expired",
				"Invalid Refresh Token: Session Expired",
			);
		}
		const user =
			outcome.status === "ok" ? this.accounts.userById(outcome.userId) : null;
		if (outcome.status !== "ok" || !user) {
			return authError(
				400,
				"refresh_token_not_found",
				"Invalid Refresh Token: Refresh Token Not Found",
			);
		}
		if (!this.#mayUse(user.email)) {
			this.accounts.revokeSession(outcome.sessionId);
			return authError(403, "access_denied", "Not allowed on this instance");
		}
		return this.#signedIn(user, outcome);
	}

	#mayUse(email: string): boolean {
		return canSignIn(
			this.policy.db(),
			email,
			this.policy.admin.isAdmin(email, true),
		);
	}

	#signedIn(user: BackendUser, issued: IssuedSession): Response {
		const nowSeconds = Math.floor(this.now() / 1000);
		this.accounts.touchSignIn(user.id);
		return json(200, {
			access_token: signAccessToken(
				this.#signingKey,
				{ sub: user.id, email: user.email, session_id: issued.sessionId },
				nowSeconds,
			),
			token_type: "bearer",
			expires_in: ACCESS_TOKEN_SECONDS,
			expires_at: nowSeconds + ACCESS_TOKEN_SECONDS,
			refresh_token: issued.refreshToken,
			user: userView({ ...user, last_sign_in_at: this.now() }),
		});
	}

	/** The bearer's claims, or GoTrue's refusal. */
	#claims(request: Request, publishableKey: string): AccessClaims | Response {
		const caller = this.caller(request, publishableKey);
		if (caller.kind === "user") {
			return caller.claims;
		}
		return caller.kind === "anonymous"
			? authError(
					401,
					"no_authorization",
					"This endpoint requires a Bearer token",
				)
			: authError(403, "bad_jwt", `invalid JWT: ${caller.reason} token`);
	}

	#logout(request: Request, publishableKey: string): Response {
		const claims = this.#claims(request, publishableKey);
		if (claims instanceof Response) {
			return claims;
		}
		const scope = new URL(request.url).searchParams.get("scope") ?? "global";
		if (scope === "local") {
			this.accounts.revokeSession(claims.session_id);
		} else if (scope === "others" || scope === "global") {
			this.accounts.revokeUserSessions(
				claims.sub,
				scope === "others" ? claims.session_id : null,
			);
		} else {
			return authError(400, "validation_failed", "Unsupported logout scope");
		}
		return new Response(null, { status: 204 });
	}

	#user(request: Request, publishableKey: string): Response {
		const claims = this.#claims(request, publishableKey);
		if (claims instanceof Response) {
			return claims;
		}
		const user = this.accounts.userById(claims.sub);
		return user
			? json(200, userView(user))
			: authError(
					403,
					"user_not_found",
					"User from sub claim in JWT does not exist",
				);
	}
}
