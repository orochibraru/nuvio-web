import type { Database } from "bun:sqlite";
import * as v from "valibot";
import { canSignIn, normalizeEmail } from "#lib/admin/admin-data.js";
import { emailConfirmationRequired } from "#lib/admin/backends-data.js";
import { m } from "#lib/i18n/index.js";
import {
	type EmailContent,
	emailHtml,
	emailText,
} from "#lib/notifications/email.js";
import type { MailSender } from "#lib/notifications/types.js";
import type { AdminService } from "#lib/services/admin.service.js";
import type { RateLimiter } from "#lib/services/rate-limit.service.js";
import type {
	BackendAccounts,
	BackendUser,
	EmailTokenKind,
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

/** Where an emailed link lands: absolute URLs of the app's pages. */
export interface MailLinks {
	resetPassword: string;
	confirmEmail: string;
}

export interface AuthPolicy {
	limiter: RateLimiter;
	admin: AdminService;
	/** The instance database, for the lock and the allowlist. */
	db: () => Database;
	mailer: MailSender;
	/** Null when this instance can't email a link (no SMTP, or no trusted origin). */
	mailLinks: () => MailLinks | null;
	/** Everything the user stored, erased before the account goes. */
	eraseData: (userId: string) => void;
}

const credentialsSchema = v.object({
	email: v.pipe(v.string(), v.maxLength(254)),
	password: v.pipe(v.string(), v.maxLength(1024)),
});
const emailSchema = v.pipe(v.string(), v.email());
const refreshSchema = v.object({
	refresh_token: v.pipe(v.string(), v.nonEmpty(), v.maxLength(512)),
});
const recoverSchema = v.object({
	email: v.pipe(v.string(), v.maxLength(254)),
});
const verifySchema = v.object({
	type: v.picklist(["signup", "email", "recovery"]),
	token_hash: v.pipe(v.string(), v.nonEmpty(), v.maxLength(512)),
});
// An email, phone or metadata change is refused, not dropped without a word.
// Anything else (supabase-js's PKCE `code_challenge`) is ignored.
const updateSchema = v.object({
	password: v.pipe(v.string(), v.maxLength(1024)),
	email: v.optional(v.never()),
	phone: v.optional(v.never()),
	data: v.optional(v.never()),
});
const passwordSchema = v.object({
	password: v.pipe(v.string(), v.maxLength(1024)),
});

const SETTINGS = {
	external: { email: true, phone: false, anonymous_users: false },
	disable_signup: false,
	phone_autoconfirm: false,
	sms_provider: "",
	saml_enabled: false,
};

function rateLimited(): Response {
	return authError(
		429,
		"over_request_rate_limit",
		"Request rate limit reached",
	);
}

function invalidEmail(): Response {
	return authError(
		400,
		"validation_failed",
		"Unable to validate email address: invalid format",
	);
}

function mailUnavailable(): Response {
	return authError(
		422,
		"email_provider_disabled",
		"Email sending is not set up on this instance",
	);
}

function emailContent(kind: EmailTokenKind, url: string) {
	const content: EmailContent =
		kind === "recovery"
			? {
					preview: m.backend_email_recovery_body(),
					heading: m.backend_email_recovery_heading(),
					paragraphs: [m.backend_email_recovery_body()],
					action: { label: m.backend_email_recovery_action(), url },
					footnote: m.backend_email_recovery_footnote(),
				}
			: {
					preview: m.backend_email_confirm_body(),
					heading: m.backend_email_confirm_heading(),
					paragraphs: [m.backend_email_confirm_body()],
					action: { label: m.backend_email_confirm_action(), url },
					footnote: m.backend_email_confirm_footnote(),
				};
	return {
		subject:
			kind === "recovery"
				? m.backend_email_recovery_subject()
				: m.backend_email_confirm_subject(),
		text: emailText(content),
		html: emailHtml(content),
	};
}

function userView(user: BackendUser) {
	const created = isoTime(user.created_at);
	const confirmed =
		user.email_confirmed_at === null ? null : isoTime(user.email_confirmed_at);
	return {
		id: user.id,
		aud: "authenticated",
		role: "authenticated",
		email: user.email,
		email_confirmed_at: confirmed,
		phone: "",
		confirmed_at: confirmed,
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
		if (route === "POST recover") {
			return this.#recover(request, context.address);
		}
		if (route === "POST verify") {
			return this.#verify(request, context.address);
		}
		if (route === "POST logout") {
			return Promise.resolve(this.#logout(request, context.publishableKey));
		}
		if (route === "GET user") {
			return Promise.resolve(this.#user(request, context.publishableKey));
		}
		if (route === "PUT user") {
			return this.#updateUser(request, context.publishableKey);
		}
		if (route === "DELETE user") {
			return this.#deleteUser(request, context);
		}
		return Promise.resolve(
			route === "GET settings" ? json(200, this.#settings()) : notFound(),
		);
	}

	#settings() {
		return {
			...SETTINGS,
			mailer_autoconfirm: !emailConfirmationRequired(this.policy.db()),
		};
	}

	/** Per address and per email, in its own budget for each `scope`. */
	#allowed(
		scope: string,
		email: string | null,
		address: string | null,
	): boolean {
		const { limiter } = this.policy;
		return (
			(address === null ||
				limiter.attempt(
					`${scope}-address:${address}`,
					ATTEMPTS_PER_ADDRESS,
					ATTEMPT_WINDOW_MS,
				)) &&
			(email === null ||
				limiter.attempt(
					`${scope}-email:${email}`,
					ATTEMPTS_PER_EMAIL,
					ATTEMPT_WINDOW_MS,
				))
		);
	}

	/** Not awaited: a send takes seconds, and the answer must not tell who has an account. */
	#mail(user: BackendUser, kind: EmailTokenKind, page: string): void {
		const token = this.accounts.issueEmailToken(user.id, kind);
		void this.policy.mailer.send({
			to: user.email,
			...emailContent(kind, `${page}?token=${token}`),
		});
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
		if (!this.#allowed("backend", email, address)) {
			return rateLimited();
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
			return invalidEmail();
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
		const confirm = emailConfirmationRequired(this.policy.db());
		const links = confirm ? this.policy.mailLinks() : null;
		if (confirm && links === null) {
			return mailUnavailable();
		}
		const user = this.accounts.createUser(
			email,
			await hashPassword(password),
			!confirm,
		);
		if (!user) {
			return authError(422, "user_already_exists", "User already registered");
		}
		// GoTrue's answer when the address must be confirmed: the user, no session.
		if (links) {
			this.#mail(user, "signup", links.confirmEmail);
			return json(200, userView(user));
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
		if (
			user.email_confirmed_at === null &&
			emailConfirmationRequired(this.policy.db())
		) {
			return authError(400, "email_not_confirmed", "Email not confirmed");
		}
		return this.#signedIn(user, this.accounts.createSession(user.id));
	}

	/** Always 200 for a well-formed address: whether it has an account stays unsaid. */
	async #recover(request: Request, address: string | null) {
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(recoverSchema, body.value);
		const email = parsed.success ? normalizeEmail(parsed.output.email) : "";
		if (!v.is(emailSchema, email)) {
			return invalidEmail();
		}
		if (!this.#allowed("backend-mail", email, address)) {
			return rateLimited();
		}
		const links = this.policy.mailLinks();
		if (links === null) {
			return mailUnavailable();
		}
		const user = this.accounts.userByEmail(email);
		if (user && this.#mayUse(email)) {
			this.#mail(user, "recovery", links.resetPassword);
		}
		return json(200, {});
	}

	async #verify(request: Request, address: string | null) {
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(verifySchema, body.value);
		if (!parsed.success) {
			return authError(
				400,
				"validation_failed",
				"Verify requires a type and a token_hash",
			);
		}
		if (!this.#allowed("backend-verify", null, address)) {
			return rateLimited();
		}
		const user = this.accounts.consumeEmailToken(
			parsed.output.token_hash,
			parsed.output.type === "recovery" ? "recovery" : "signup",
		);
		if (!user) {
			return authError(
				403,
				"otp_expired",
				"Email link is invalid or has expired",
			);
		}
		if (!this.#mayUse(user.email)) {
			return authError(403, "access_denied", "Not allowed on this instance");
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

	/** A new password only. Every other session ends, as in GoTrue. */
	async #updateUser(request: Request, publishableKey: string) {
		const claims = this.#claims(request, publishableKey);
		if (claims instanceof Response) {
			return claims;
		}
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(updateSchema, body.value);
		if (!parsed.success) {
			return authError(
				400,
				"validation_failed",
				"Only the password can be changed",
			);
		}
		const user = this.accounts.userById(claims.sub);
		if (!user) {
			return userNotFound();
		}
		const { password } = parsed.output;
		if (password.length < MIN_PASSWORD_LENGTH) {
			return authError(
				422,
				"weak_password",
				`Password should be at least ${MIN_PASSWORD_LENGTH} characters.`,
			);
		}
		if (await globalThis.Bun.password.verify(password, user.password_hash)) {
			return authError(
				422,
				"same_password",
				"New password should be different from the old password.",
			);
		}
		this.accounts.setPassword(
			user.id,
			await hashPassword(password),
			claims.session_id,
		);
		return json(200, userView(this.accounts.userById(user.id) ?? user));
	}

	/** The caller's own account and all its data, behind its password. */
	async #deleteUser(
		request: Request,
		context: { publishableKey: string; address: string | null },
	) {
		const claims = this.#claims(request, context.publishableKey);
		if (claims instanceof Response) {
			return claims;
		}
		const body = await readBody(request);
		if (!body.ok) {
			return body.response;
		}
		const parsed = v.safeParse(passwordSchema, body.value);
		if (!parsed.success) {
			return authError(400, "validation_failed", "Password required");
		}
		if (!this.#allowed("backend", claims.email, context.address)) {
			return rateLimited();
		}
		const user = this.accounts.userById(claims.sub);
		if (!user) {
			return userNotFound();
		}
		if (
			!(await globalThis.Bun.password.verify(
				parsed.output.password,
				user.password_hash,
			))
		) {
			return authError(400, "invalid_credentials", "Invalid login credentials");
		}
		this.policy.db().transaction(() => {
			this.policy.eraseData(user.id);
			this.accounts.deleteUser(user.id);
		})();
		return new Response(null, { status: 204 });
	}

	#user(request: Request, publishableKey: string): Response {
		const claims = this.#claims(request, publishableKey);
		if (claims instanceof Response) {
			return claims;
		}
		const user = this.accounts.userById(claims.sub);
		return user ? json(200, userView(user)) : userNotFound();
	}
}

function userNotFound(): Response {
	return authError(
		403,
		"user_not_found",
		"User from sub claim in JWT does not exist",
	);
}
