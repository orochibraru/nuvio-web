import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import * as v from "valibot";
import { m } from "#lib/i18n/index.js";
import {
	discoverPublishableKey,
	isPublishableKey,
	type NuvioBackend,
	parseBackendUrl,
	trustedBackendFetch,
} from "#lib/nuvio/backend.js";
import { NUVIO_BASE_URL } from "#lib/nuvio/index.js";

// The custom backend policy and the backends users signed in through. Every
// query takes its `Database` and binds its values, like `admin-data.ts`.

const CUSTOM_ALLOWED_KEY = "backends.custom_allowed";
const DEFAULT_URL_KEY = "backends.default_url";
const DEFAULT_KEY_KEY = "backends.default_key";
const CONFIRM_EMAIL_KEY = "builtin_backend.confirm_email";

export interface BackendPolicy {
	/** Whether a user may type in a backend of their own at sign-in. */
	customAllowed: boolean;
	/** The admin's replacement for the official API, or null to use it. */
	defaultBackend: NuvioBackend | null;
}

/** A backend users signed in through, as the admin tab lists it. Times are unix ms. */
export interface SeenBackend {
	id: string;
	url: string;
	firstSeenAt: number;
	lastSeenAt: number;
	accountCount: number;
	banned: boolean;
	bannedAt: number | null;
	bannedBy: string | null;
}

/** What the admin page streams to the Backends tab as `backends`. */
export interface BackendsTabData {
	customAllowed: boolean;
	defaultUrl: string;
	defaultKey: string;
	seen: SeenBackend[];
}

function setting(db: Database, key: string): string | null {
	const row = db
		.query<{ value: string }, [string]>(
			"SELECT value FROM settings WHERE key = ?",
		)
		.get(key);
	return row?.value ?? null;
}

function writeSetting(db: Database, key: string, value: string | null): void {
	if (value === null) {
		db.query("DELETE FROM settings WHERE key = ?").run(key);
		return;
	}
	db.query(
		`INSERT INTO settings (key, value) VALUES ($key, $value)
		 ON CONFLICT(key) DO UPDATE SET value = $value`,
	).run({ $key: key, $value: value });
}

export function backendPolicy(db: Database): BackendPolicy {
	// Re-checked on the way out too: a hand-edited row must not reach a header.
	const url = parseBackendUrl(setting(db, DEFAULT_URL_KEY) ?? "");
	const publishableKey = setting(db, DEFAULT_KEY_KEY) ?? "";
	return {
		customAllowed: setting(db, CUSTOM_ALLOWED_KEY) === "1",
		defaultBackend:
			url && isPublishableKey(publishableKey)
				? { url, publishableKey, trusted: true }
				: null,
	};
}

/**
 * Whether a session's backend is the instance default (the official API unless
 * an admin replaced it): the only one whose emails count for the admin list
 * and the allowlist.
 */
export function isDefaultBackend(
	backend: NuvioBackend | null,
	policy: BackendPolicy,
): boolean {
	if (policy.defaultBackend === null) {
		return backend === null;
	}
	return backend?.trusted === true && backend.url === policy.defaultBackend.url;
}

/** No database means nobody set a policy: the official API, no custom backends. */
export function policyOrDefault(db: Database | null): BackendPolicy {
	return db
		? backendPolicy(db)
		: { customAllowed: false, defaultBackend: null };
}

/** Allows custom backends unless an admin already chose either way: the boot default of `NUVIO_ALLOW_CUSTOM_BACKENDS`. */
export function allowCustomBackendsUnlessSet(db: Database): void {
	db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").run(
		CUSTOM_ALLOWED_KEY,
	);
}

export function setCustomBackendsAllowed(db: Database, allowed: boolean): void {
	writeSetting(db, CUSTOM_ALLOWED_KEY, allowed ? "1" : "0");
}

/** Null (or the official URL) goes back to the official API. */
export function setDefaultBackend(
	db: Database,
	backend: { url: string; publishableKey: string } | null,
): void {
	const official = backend === null || backend.url === NUVIO_BASE_URL;
	writeSetting(db, DEFAULT_URL_KEY, official ? null : backend.url);
	writeSetting(db, DEFAULT_KEY_KEY, official ? null : backend.publishableKey);
}

/** Whether the built-in backend makes new accounts confirm their email first. Off by default. */
export function emailConfirmationRequired(db: Database): boolean {
	return setting(db, CONFIRM_EMAIL_KEY) === "1";
}

export function setEmailConfirmationRequired(
	db: Database,
	required: boolean,
): void {
	writeSetting(db, CONFIRM_EMAIL_KEY, required ? "1" : null);
}

/** A backend URL and key as an admin or the sign-in form typed them. */
export const backendFieldsSchema = v.object({
	url: v.pipe(
		v.string(),
		v.check(
			(value) => parseBackendUrl(value) !== null,
			() => m.auth_error_backend_url_invalid(),
		),
		v.transform((value) => parseBackendUrl(value) as string),
	),
	// Empty: read from the backend's `/.well-known/nuvio` by `withPublishableKey`.
	publishableKey: v.pipe(
		v.string(),
		v.trim(),
		v.check(
			(value) => value === "" || isPublishableKey(value),
			() => m.auth_error_backend_key_invalid(),
		),
	),
});

/** The backend with its typed key, or the one it publishes when none was typed; null when it publishes none. */
export async function withPublishableKey(
	backend: { url: string; publishableKey: string },
	fetchImpl: typeof fetch = trustedBackendFetch,
): Promise<{ url: string; publishableKey: string } | null> {
	if (backend.publishableKey) {
		return backend;
	}
	const publishableKey = await discoverPublishableKey(backend.url, fetchImpl);
	return publishableKey === null ? null : { url: backend.url, publishableKey };
}

interface SeenRow {
	id: string;
	url: string;
	first_seen_at: number;
	last_seen_at: number;
	account_count: number;
	banned: number;
	banned_at: number | null;
	banned_by: string | null;
}

export function listSeenBackends(db: Database): SeenBackend[] {
	return db
		.query<SeenRow, []>(
			"SELECT * FROM custom_backends ORDER BY last_seen_at DESC",
		)
		.all()
		.map((row) => ({
			id: row.id,
			url: row.url,
			firstSeenAt: row.first_seen_at,
			lastSeenAt: row.last_seen_at,
			accountCount: row.account_count,
			banned: row.banned === 1,
			bannedAt: row.banned_at,
			bannedBy: row.banned_by,
		}));
}

/** For the admin page load to stream as `backends`. */
export function pullBackendRequests(db: Database): Promise<BackendsTabData> {
	return Promise.resolve().then(() => {
		const policy = backendPolicy(db);
		return {
			customAllowed: policy.customAllowed,
			defaultUrl: policy.defaultBackend?.url ?? "",
			defaultKey: policy.defaultBackend?.publishableKey ?? "",
			seen: listSeenBackends(db),
		};
	});
}

export function isBannedBackend(db: Database, url: string): boolean {
	return (
		db
			.query<{ banned: number }, [string]>(
				"SELECT banned FROM custom_backends WHERE url = ?",
			)
			.get(url)?.banned === 1
	);
}

/** Notes a successful sign-in through a user's backend; `firstSeen` the first time that URL shows up. */
export function recordCustomSignIn(
	db: Database,
	url: string,
	accountKey: string,
	now = Date.now(),
): { id: string; firstSeen: boolean } {
	return db.transaction(() => {
		const existing = db
			.query<{ id: string }, [string]>(
				"SELECT id FROM custom_backends WHERE url = ?",
			)
			.get(url);
		const id = existing?.id ?? randomUUID();
		if (existing) {
			db.query("UPDATE custom_backends SET last_seen_at = ? WHERE id = ?").run(
				now,
				id,
			);
		} else {
			db.query(
				`INSERT INTO custom_backends (id, url, first_seen_at, last_seen_at)
				 VALUES (?, ?, ?, ?)`,
			).run(id, url, now, now);
		}
		db.query(
			"INSERT OR IGNORE INTO custom_backend_accounts (backend_id, account_key) VALUES (?, ?)",
		).run(id, accountKey);
		db.query(
			`UPDATE custom_backends SET account_count =
				(SELECT COUNT(*) FROM custom_backend_accounts WHERE backend_id = ?)
			 WHERE id = ?`,
		).run(id, id);
		return { id, firstSeen: !existing };
	})();
}

/** Bans or unbans a seen backend; its URL, or null when there is no such row. */
export function setBackendBanned(
	db: Database,
	id: string,
	{ banned, by }: { banned: boolean; by: string },
	now = Date.now(),
): string | null {
	const row = db
		.query<{ url: string }, [string]>(
			"SELECT url FROM custom_backends WHERE id = ?",
		)
		.get(id);
	if (!row) {
		return null;
	}
	db.query(
		"UPDATE custom_backends SET banned = ?, banned_at = ?, banned_by = ? WHERE id = ?",
	).run(banned ? 1 : 0, banned ? now : null, banned ? by : null, id);
	return row.url;
}

/** Whether the backend answers its auth settings endpoint with this key. Never throws. */
export async function testBackend(
	backend: { url: string; publishableKey: string },
	fetchImpl: typeof fetch = trustedBackendFetch,
): Promise<boolean> {
	try {
		const response = await fetchImpl(`${backend.url}/auth/v1/settings`, {
			headers: { apikey: backend.publishableKey },
		});
		return response.ok;
	} catch {
		return false;
	}
}
