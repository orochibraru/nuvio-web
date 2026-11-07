import { createHash } from "node:crypto";
import * as v from "valibot";
import { httpUrlOrNull } from "#lib/core/url.js";
import {
	pinnedFetch,
	readTextCapped,
	safeFetch,
} from "#lib/server/safe-fetch.js";
import {
	NUVIO_BASE_URL,
	NuvioApiError,
	NuvioClient,
	type NuvioClientOptions,
} from "./client.ts";
import type { AuthSession } from "./types.ts";

// Server only: node:crypto and the SSRF guard.

/**
 * A Supabase-style backend a session signed in to instead of the official
 * one: the instance default an admin set (`trusted`, may be on the LAN) or one
 * a user typed in (untrusted, public addresses only).
 */
export interface NuvioBackend {
	url: string;
	publishableKey: string;
	trusted: boolean;
}

/** Why a custom backend could not answer: codes the sign-in form words. */
export const BACKEND_BLOCKED = "backend_blocked";
export const BACKEND_UNREACHABLE = "backend_unreachable";
export const BACKEND_INVALID = "backend_invalid";

const MAX_URL_LENGTH = 2048;
const KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{1,1024}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
const UNSAFE_URL_CHARACTERS = /[\s\u0000-\u001f\u007f\\?#]/;
const TIMEOUT_MS = 12_000;
// A sync page is 1000 rows; this leaves room for long descriptions.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * `raw` as `origin + path` without a trailing slash, or null: http(s) only, no
 * credentials, no whitespace, control characters, query or fragment.
 */
export function parseBackendUrl(raw: string): string | null {
	const value = raw.trim();
	if (
		value.length > MAX_URL_LENGTH ||
		UNSAFE_URL_CHARACTERS.test(value) ||
		httpUrlOrNull(value) === null
	) {
		return null;
	}
	const url = new URL(value);
	if (url.username || url.password) {
		return null;
	}
	return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** A bounded token charset: it goes out as the `apikey` header, so nothing that can split one. */
export function isPublishableKey(value: string): boolean {
	return KEY_PATTERN.test(value);
}

const discoverySchema = v.looseObject({
	service: v.literal("nuvio"),
	publishable_key: v.pipe(v.string(), v.check(isPublishableKey)),
});

/**
 * The publishable key a self-hosted Nuvio backend publishes at
 * `/.well-known/nuvio`, or null. Its `backend_url` is ignored: in local mode
 * it says `localhost`, and the URL that reached it is the one to keep.
 */
export async function discoverPublishableKey(
	url: string,
	fetchImpl: typeof fetch,
): Promise<string | null> {
	try {
		const response = await fetchImpl(`${url}/.well-known/nuvio`, {
			headers: { accept: "application/json" },
		});
		if (!response.ok) {
			return null;
		}
		const parsed = v.safeParse(discoverySchema, await response.json());
		return parsed.success ? parsed.output.publishable_key : null;
	} catch {
		return null;
	}
}

/** What a log line may say about a backend: its origin, never a path or a key. */
export function backendOrigin(url: string): string {
	return httpUrlOrNull(url) ? new URL(url).origin : "invalid";
}

/**
 * The identity everything on this server is keyed by. A user of the official
 * API keeps their bare user id (existing data keeps its key); on any other
 * backend the id is hashed with its URL, so no backend can claim another
 * backend's user.
 */
export function accountKey(
	userId: string,
	backend: NuvioBackend | null,
): string {
	if (backend === null || backend.url === NUVIO_BASE_URL) {
		return userId;
	}
	const digest = createHash("sha256")
		.update(`${backend.url}\n${userId}`)
		.digest("base64url");
	return `custom-${digest}`;
}

/**
 * The only way out to a non-official backend: the SSRF guard on every hop
 * (private addresses allowed only for the admin's trusted default), a
 * deadline, a capped body, and every transport failure as a coded
 * `NuvioApiError` rather than its own text.
 */
function backendFetch(trusted: boolean): typeof fetch {
	return (async (input: string | URL | Request, init: RequestInit = {}) => {
		const deadline = AbortSignal.timeout(TIMEOUT_MS);
		const signal = init.signal
			? AbortSignal.any([init.signal, deadline])
			: deadline;
		const url = input instanceof Request ? input.url : String(input);
		try {
			const response = await safeFetch(
				url,
				trusted ? globalThis.fetch : pinnedFetch,
				{ ...init, signal },
				{ allowHttp: true, allowPrivate: trusted },
			);
			const body = await readTextCapped(response, MAX_RESPONSE_BYTES);
			return new Response(
				NULL_BODY_STATUSES.has(response.status) ? null : body,
				{
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				},
			);
		} catch (error) {
			// The client's own deadline: let it report its timeout.
			throw init.signal?.aborted ? error : transportError(error);
		}
	}) as typeof fetch;
}

function transportError(error: unknown): NuvioApiError {
	const blocked =
		error instanceof Error &&
		error.message === "URL resolves to a disallowed address";
	return new NuvioApiError(
		502,
		{ code: blocked ? BACKEND_BLOCKED : BACKEND_UNREACHABLE },
		"The backend could not be reached.",
	);
}

export const untrustedBackendFetch = backendFetch(false);
export const trustedBackendFetch = backendFetch(true);

/** A backend this process answers itself (the built-in one): its requests never leave the process. */
export interface LocalBackend {
	owns: (backend: NuvioBackend) => boolean;
	fetch: typeof globalThis.fetch;
}

function fetchFor(
	backend: NuvioBackend,
	local: LocalBackend | null,
): typeof globalThis.fetch {
	if (local?.owns(backend)) {
		return local.fetch;
	}
	return backend.trusted ? trustedBackendFetch : untrustedBackendFetch;
}

/** How to build a `NuvioClient` for a session's backend: the official one when null. */
export function clientOptions(
	backend: NuvioBackend | null,
	fetch: typeof globalThis.fetch = globalThis.fetch,
	local: LocalBackend | null = null,
): NuvioClientOptions {
	if (backend === null) {
		return { fetch };
	}
	return {
		baseUrl: backend.url,
		publishableKey: backend.publishableKey,
		fetch: fetchFor(backend, local),
		keepFetch: true,
	};
}

const sessionSchema = v.looseObject({
	access_token: v.pipe(v.string(), v.nonEmpty(), v.maxLength(16_384)),
	refresh_token: v.pipe(v.string(), v.nonEmpty(), v.maxLength(4096)),
	expires_in: v.pipe(v.number(), v.integer(), v.minValue(0)),
	user: v.looseObject({
		id: v.pipe(v.string(), v.regex(USER_ID_PATTERN)),
		email: v.nullish(v.pipe(v.string(), v.maxLength(254), v.email())),
	}),
});

/** True when a non-official backend's answer has what a stored session needs, in a sane shape. */
export function isAuthSession(value: unknown): value is AuthSession {
	return v.is(sessionSchema, value);
}

export function invalidBackendAnswer(): NuvioApiError {
	return new NuvioApiError(
		502,
		{ code: BACKEND_INVALID },
		"The backend did not answer like a Nuvio backend.",
	);
}

/** Trades a refresh token with the backend that issued it; a non-official one's answer is checked. */
export async function refreshSession(
	refreshToken: string,
	backend: NuvioBackend | null,
	local: LocalBackend | null = null,
): Promise<AuthSession> {
	const client = new NuvioClient(
		clientOptions(backend, globalThis.fetch, local),
	);
	if (backend === null) {
		return await client.refreshSession(refreshToken);
	}
	let session: unknown;
	try {
		session = await client.refreshSession(refreshToken);
	} catch (error) {
		throw error instanceof NuvioApiError ? error : invalidBackendAnswer();
	}
	if (!isAuthSession(session)) {
		throw invalidBackendAnswer();
	}
	return session;
}
