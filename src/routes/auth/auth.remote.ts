import { invalid, redirect } from "@sveltejs/kit";
import { canSignIn, isLocked, recordSignIn } from "#lib/admin/admin-data.js";
import {
	isBannedBackend,
	isDefaultBackend,
	policyOrDefault,
	recordCustomSignIn,
} from "#lib/admin/backends-data.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { safeRedirectPath } from "#lib/core/url.js";
import { signInSchema, signUpSchema } from "#lib/forms/schemas.js";
import { m } from "#lib/i18n/index.js";
import {
	accountKey,
	BACKEND_BLOCKED,
	BACKEND_UNREACHABLE,
	backendOrigin,
	clientOptions,
	discoverPublishableKey,
	isAuthSession,
	isPublishableKey,
	type NuvioBackend,
	parseBackendUrl,
	untrustedBackendFetch,
} from "#lib/nuvio/backend.js";
import {
	type AuthSession,
	NUVIO_BASE_URL,
	NuvioApiError,
	NuvioClient,
} from "#lib/nuvio/index.js";
import {
	ADMIN,
	ADMIN_NOTIFIER,
	DATABASE,
	LOGGER,
	RATE_LIMITER,
	SESSION,
} from "#lib/services/index.js";
import { NUVIO_SYNC } from "#lib/userdata/tokens.js";
import { resolve } from "$app/paths";
import { form, getRequestEvent } from "$app/server";

type FieldIssue = (message: string) => Parameters<typeof invalid>[0];
interface BackendIssues {
	backendUrl: FieldIssue;
	backendKey: FieldIssue;
}

/**
 * The backend to sign in through: the instance default (the official API, or
 * the one an admin set) when the form names none, the official API when it
 * names that, else the user's own, which the admin must allow and must not
 * have banned. Null is the official API.
 */
async function backendOf(
	data: { backendUrl: string; backendKey: string },
	issue: BackendIssues,
): Promise<NuvioBackend | null> {
	const db = getRequestEvent().locals.services.get(DATABASE).tryConnect();
	const policy = policyOrDefault(db);
	if (!data.backendUrl.trim()) {
		return policy.defaultBackend;
	}
	const url = parseBackendUrl(data.backendUrl);
	// The official API is always on offer, custom backends allowed or not.
	if (url === NUVIO_BASE_URL) {
		return null;
	}
	if (!policy.customAllowed) {
		invalid(m.auth_error_backend_disallowed());
	}
	if (url === null) {
		invalid(issue.backendUrl(m.auth_error_backend_url_invalid()));
	}
	if (url === policy.defaultBackend?.url) {
		return policy.defaultBackend;
	}
	if (db && isBannedBackend(db, url)) {
		invalid(m.auth_error_backend_banned());
	}
	const publishableKey =
		data.backendKey.trim() ||
		(await discoverPublishableKey(url, untrustedBackendFetch));
	if (publishableKey === null) {
		invalid(issue.backendKey(m.auth_error_backend_key_not_found()));
	}
	if (!isPublishableKey(publishableKey)) {
		invalid(issue.backendKey(m.auth_error_backend_key_invalid()));
	}
	return { url, publishableKey, trusted: false };
}

function isTrusted(backend: NuvioBackend | null): boolean {
	const db = getRequestEvent().locals.services.get(DATABASE).tryConnect();
	return isDefaultBackend(backend, policyOrDefault(db));
}

/**
 * The instance lock. Checked before the credentials reach Nuvio, so a locked
 * instance never becomes an oracle for which accounts exist upstream, and the
 * refusal is identical whether or not the password was right. A custom
 * backend is refused outright: the email it would vouch for can't be trusted.
 */
function assertAllowed(email: string, backend: NuvioBackend | null): void {
	const services = getRequestEvent().locals.services;
	const db = services.get(DATABASE).tryConnect();
	if (!db) {
		return;
	}
	if (!isTrusted(backend)) {
		if (isLocked(db)) {
			invalid(m.auth_error_backend_locked());
		}
		return;
	}
	if (canSignIn(db, email, services.get(ADMIN).isAdmin(email, true))) {
		return;
	}
	services.get(LOGGER).warn("Blocked sign-in: instance is locked", { email });
	invalid(m.auth_error_invite_only());
}

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_PER_ADDRESS = 10;
const ATTEMPTS_PER_EMAIL = 5;

// Before the backend is resolved, so a bad URL or key costs an attempt too.
function assertNotThrottled(email: string, backendUrl: string): void {
	const { getClientAddress, locals } = getRequestEvent();
	const limiter = locals.services.get(RATE_LIMITER);
	const custom = backendUrl.trim() ? parseBackendUrl(backendUrl) : null;
	const account = custom
		? `${custom} ${email.toLowerCase()}`
		: email.toLowerCase();
	if (
		!(
			limiter.attempt(
				`address:${getClientAddress()}`,
				ATTEMPTS_PER_ADDRESS,
				ATTEMPT_WINDOW_MS,
			) &&
			limiter.attempt(`email:${account}`, ATTEMPTS_PER_EMAIL, ATTEMPT_WINDOW_MS)
		)
	) {
		invalid(m.auth_error_rate_limited());
	}
}

/**
 * Metrics are a side-effect of signing in, never a condition of it: a failed
 * write is logged and swallowed rather than turning a valid sign-in into a 500.
 */
function record(email: string, userId: string): void {
	const services = getRequestEvent().locals.services;
	const db = services.get(DATABASE).tryConnect();
	if (!db) {
		return;
	}
	try {
		recordSignIn(db, email, userId);
	} catch (error) {
		services.get(LOGGER).error("Could not record a sign-in", {
			error: error instanceof Error ? error : "Unknown error",
		});
	}
}

/** Words a failed auth call; a custom backend's transport failures get their own code. */
function failed(
	error: unknown,
	backend: NuvioBackend | null,
	fallback: string,
): never {
	if (error instanceof NuvioApiError) {
		if (error.code === BACKEND_BLOCKED) {
			invalid(m.auth_error_backend_blocked());
		}
		if (
			backend &&
			(error.code === BACKEND_UNREACHABLE || error.status === 408)
		) {
			invalid(m.auth_error_backend_unreachable());
		}
		invalid(fallback);
	}
	if (backend) {
		invalid(m.auth_error_backend_invalid());
	}
	throw error;
}

/** Notes a user's own backend for the admin tab, and tells the admins the first time. */
async function noteCustomBackend(url: string, key: string): Promise<void> {
	const services = getRequestEvent().locals.services;
	const db = services.get(DATABASE).tryConnect();
	if (!db) {
		return;
	}
	try {
		const seen = recordCustomSignIn(db, url, key);
		if (seen.firstSeen) {
			await services
				.get(ADMIN_NOTIFIER)
				.notify({ kind: "custom_backend_seen", backendId: seen.id, url });
		}
	} catch (error) {
		services.get(LOGGER).error("Could not record a custom backend", {
			backend: backendOrigin(url),
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

/** Stores the session; a non-official backend's answer is checked and keyed under that backend. */
async function start(
	session: AuthSession,
	backend: NuvioBackend | null,
	email: string,
): Promise<void> {
	if (backend && !isAuthSession(session)) {
		invalid(m.auth_error_backend_invalid());
	}
	const { locals } = getRequestEvent();
	locals.services.get(SESSION).write(session, backend);
	const key = accountKey(session.user.id, backend);
	const shown = session.user.email ?? email;
	record(backend ? `${shown} (${backendOrigin(backend.url)})` : shown, key);
	if (backend && !backend.trusted) {
		await noteCustomBackend(backend.url, key);
	}
	// Pull what the Nuvio apps changed while this browser was away.
	locals.services.get(NUVIO_SYNC).touch(key);
}

function safeTarget(value: string): string {
	return safeRedirectPath(value, resolve("/(protected)/(app)"));
}

export const signIn = form(signInSchema, async (data, issue) => {
	const { fetch, locals } = getRequestEvent();
	assertNotThrottled(data.email, data.backendUrl);
	const backend = await backendOf(data, issue);
	assertAllowed(data.email, backend);
	let session: AuthSession;
	try {
		session = await new NuvioClient(
			clientOptions(backend, fetch, locals.services.get(BUILT_IN_BACKEND)),
		).signInWithPassword({ email: data.email, password: data.password });
	} catch (error) {
		locals.services.get(LOGGER).warn("Sign-in failed", {
			email: data.email,
			backend: backend ? backendOrigin(backend.url) : "official",
			status: error instanceof NuvioApiError ? error.status : "none",
			code: error instanceof NuvioApiError ? (error.code ?? "none") : "none",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		if (
			error instanceof NuvioApiError &&
			(error.status === 400 || error.status === 401 || error.status === 403)
		) {
			invalid(issue.password(m.auth_error_invalid_credentials()));
		}
		failed(error, backend, m.auth_error_sign_in_failed());
	}
	await start(session, backend, data.email);
	redirect(303, safeTarget(data.redirectTo));
});

export const signUp = form(signUpSchema, async (data, issue) => {
	const { fetch, locals } = getRequestEvent();
	assertNotThrottled(data.email, data.backendUrl);
	const backend = await backendOf(data, issue);
	assertAllowed(data.email, backend);
	let session: AuthSession;
	try {
		session = await new NuvioClient(
			clientOptions(backend, fetch, locals.services.get(BUILT_IN_BACKEND)),
		).signUp({
			email: data.email,
			password: data.password,
		});
	} catch (error) {
		if (
			error instanceof NuvioApiError &&
			(error.status === 409 || error.status === 422)
		) {
			invalid(issue.email(m.auth_error_email_taken()));
		}
		failed(error, backend, m.auth_error_sign_up_failed());
	}
	// No session when the backend wants the address confirmed first.
	const hasSession = Boolean(session?.access_token);
	if (hasSession) {
		await start(session, backend, data.email);
	}
	const params = new URLSearchParams({ registered: "1" });
	if (data.redirectTo && data.redirectTo !== "/") {
		params.set("redirectTo", data.redirectTo);
	}
	redirect(
		303,
		hasSession
			? safeTarget(data.redirectTo)
			: `${resolve("auth/sign-in")}?${params}`,
	);
});

export const signOut = form(async () => {
	const { locals } = getRequestEvent();
	try {
		await locals.nuvio.signOut();
	} catch (error) {
		if (!(error instanceof NuvioApiError)) {
			throw error;
		}
	}
	locals.services.get(SESSION).clear();
	redirect(303, resolve("auth/sign-in"));
});
