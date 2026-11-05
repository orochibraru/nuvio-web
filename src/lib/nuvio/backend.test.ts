import { afterEach, describe, expect, it, vi } from "vitest";
import {
	accountKey,
	BACKEND_BLOCKED,
	BACKEND_INVALID,
	BACKEND_UNREACHABLE,
	backendOrigin,
	clientOptions,
	discoverPublishableKey,
	isAuthSession,
	isPublishableKey,
	type NuvioBackend,
	parseBackendUrl,
	refreshSession,
	trustedBackendFetch,
	untrustedBackendFetch,
} from "./backend.ts";
import { NUVIO_BASE_URL, NuvioApiError, NuvioClient } from "./client.ts";

const custom: NuvioBackend = {
	url: "https://backend.example",
	publishableKey: "key",
	trusted: false,
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("parseBackendUrl", () => {
	it("normalises to origin + path without a trailing slash", () => {
		expect(parseBackendUrl("  HTTPS://Backend.Example:443/supabase/  ")).toBe(
			"https://backend.example/supabase",
		);
		expect(parseBackendUrl("http://backend.example")).toBe(
			"http://backend.example",
		);
	});

	it.each([
		"",
		"backend.example",
		"javascript:alert(1)",
		"data:text/html,x",
		"ftp://backend.example",
		"https://user:pass@backend.example",
		"https://user@backend.example",
		"https://backend.example/a b",
		"https://backend.example/a\tb",
		"https://backend.example/\u0000",
		"https://backend.example/\u007f",
		"https://backend.example\\evil.example",
		"https://backend.example/?apikey=x",
		"https://backend.example/#x",
		`https://backend.example/${"a".repeat(2050)}`,
	])("refuses %j", (raw) => {
		expect(parseBackendUrl(raw)).toBeNull();
	});
});

describe("isPublishableKey", () => {
	it("takes JWT anon keys and publishable keys", () => {
		expect(
			isPublishableKey("sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN"),
		).toBe(true);
		expect(isPublishableKey("eyJhbGciOi.eyJyb2xlIjoi.c2lnbmF0dXJl")).toBe(true);
	});

	it.each([
		"",
		"a\r\nx-injected: 1",
		"a\nb",
		"a b",
		"a;b",
		"é",
		"k".repeat(1025),
	])("refuses %j", (key) => {
		expect(isPublishableKey(key)).toBe(false);
	});
});

describe("backendOrigin", () => {
	it("keeps only the origin for a log line", () => {
		expect(backendOrigin("https://backend.example/secret/path")).toBe(
			"https://backend.example",
		);
		expect(backendOrigin("not a url")).toBe("invalid");
	});
});

describe("accountKey", () => {
	it("leaves an official user's key exactly as it was", () => {
		expect(accountKey("uuid-1", null)).toBe("uuid-1");
		expect(
			accountKey("uuid-1", { ...custom, url: NUVIO_BASE_URL, trusted: true }),
		).toBe("uuid-1");
	});

	it("namespaces every other backend, the admin default included", () => {
		const lan = {
			url: "http://192.168.1.10",
			publishableKey: "k",
			trusted: true,
		};
		const onCustom = accountKey("uuid-1", custom);
		const onDefault = accountKey("uuid-1", lan);
		expect(onCustom).toMatch(/^custom-[\w-]{43}$/);
		expect(onDefault).toMatch(/^custom-[\w-]{43}$/);
		expect(new Set(["uuid-1", onCustom, onDefault]).size).toBe(3);
	});

	it("is the same backend whether the admin or a user named it", () => {
		expect(accountKey("u", custom)).toBe(
			accountKey("u", { ...custom, trusted: true, publishableKey: "other" }),
		);
	});
});

describe("isAuthSession", () => {
	const valid = {
		access_token: "a",
		refresh_token: "r",
		expires_in: 3600,
		user: { id: "8a7b-uuid", email: "a@b.co" },
	};

	it("takes a sane session, email optional", () => {
		expect(isAuthSession(valid)).toBe(true);
		expect(isAuthSession({ ...valid, user: { id: "x", email: null } })).toBe(
			true,
		);
	});

	it.each([
		["no user", { ...valid, user: undefined }],
		["an empty id", { ...valid, user: { id: "" } }],
		["an id with a newline", { ...valid, user: { id: "a\nb" } }],
		["an id with a slash", { ...valid, user: { id: "../x" } }],
		["an over-long id", { ...valid, user: { id: "a".repeat(129) } }],
		["a non-email", { ...valid, user: { id: "x", email: "<script>" } }],
		[
			"an over-long email",
			{ ...valid, user: { id: "x", email: `${"a".repeat(250)}@b.co` } },
		],
		["no access token", { ...valid, access_token: "" }],
		["a fractional expiry", { ...valid, expires_in: 1.5 }],
		["a string", "session"],
	])("refuses %s", (_label, value) => {
		expect(isAuthSession(value)).toBe(false);
	});
});

describe("backend fetch", () => {
	it("refuses a user's backend on a private or loopback address", async () => {
		for (const url of [
			"http://127.0.0.1/auth/v1/settings",
			"http://192.168.1.10/auth/v1/settings",
			"http://[::1]/auth/v1/settings",
		]) {
			await expect(untrustedBackendFetch(url)).rejects.toSatisfy(
				(error) =>
					error instanceof NuvioApiError && error.code === BACKEND_BLOCKED,
			);
		}
	});

	it("lets the admin's trusted default reach the LAN", async () => {
		const spy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response('{"ok":true}'));
		const response = await trustedBackendFetch("http://192.168.1.10/x");
		expect(await response.json()).toEqual({ ok: true });
		expect(spy).toHaveBeenCalledWith(
			"http://192.168.1.10/x",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("still refuses a non-http scheme for the trusted default", async () => {
		await expect(trustedBackendFetch("file:///etc/passwd")).rejects.toSatisfy(
			(error) =>
				error instanceof NuvioApiError && error.code === BACKEND_UNREACHABLE,
		);
	});

	it("caps the body, as a coded error rather than the transport's text", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("x", {
				headers: { "content-length": String(64 * 1024 * 1024) },
			}),
		);
		await expect(
			trustedBackendFetch("http://192.168.1.10/x"),
		).rejects.toSatisfy(
			(error) =>
				error instanceof NuvioApiError &&
				error.code === BACKEND_UNREACHABLE &&
				!error.message.includes("192.168"),
		);
	});
});

describe("clientOptions", () => {
	it("keeps the official API on the request fetch", () => {
		const fetch = vi.fn() as unknown as typeof globalThis.fetch;
		expect(clientOptions(null, fetch)).toEqual({ fetch });
	});

	it("points a custom backend's client at it, with its key and guarded fetch", () => {
		const fetch = vi.fn() as unknown as typeof globalThis.fetch;
		const client = new NuvioClient(clientOptions(custom, fetch));
		expect(client.baseUrl).toBe("https://backend.example");
		expect(client.publishableKey).toBe("key");
		expect(clientOptions(custom, fetch).fetch).toBe(untrustedBackendFetch);
		expect(clientOptions({ ...custom, trusted: true }, fetch).fetch).toBe(
			trustedBackendFetch,
		);
	});
});

describe("refreshSession", () => {
	it("refreshes against the session's own backend", async () => {
		const seen: string[] = [];
		vi.spyOn(NuvioClient.prototype, "refreshSession").mockImplementation(
			async function (this: NuvioClient) {
				seen.push(this.baseUrl);
				return {
					access_token: "a",
					refresh_token: "r",
					expires_in: 60,
					token_type: "bearer",
					user: { id: "u" },
				} as never;
			},
		);
		await refreshSession("rt", custom);
		await refreshSession("rt", null);
		expect(seen).toEqual(["https://backend.example", NUVIO_BASE_URL]);
	});

	it("refuses a custom backend's malformed answer as a coded error", async () => {
		vi.spyOn(NuvioClient.prototype, "refreshSession").mockResolvedValue({
			user: { id: "a\nb" },
		} as never);
		await expect(refreshSession("rt", custom)).rejects.toSatisfy(
			(error) =>
				error instanceof NuvioApiError && error.code === BACKEND_INVALID,
		);
	});
});

describe("discoverPublishableKey", () => {
	const answer = (body: unknown, status = 200) =>
		vi.fn(async () => new Response(JSON.stringify(body), { status }));

	it("reads the key from the backend's /.well-known/nuvio", async () => {
		const fetch = answer({
			version: 1,
			service: "nuvio",
			self_hosted: true,
			backend_url: "http://localhost:8000",
			publishable_key: "sb_publishable_abc",
			capabilities: { email_password_auth: true, tv_login: true },
		});
		expect(
			await discoverPublishableKey(
				"https://backend.example/sub",
				fetch as never,
			),
		).toBe("sb_publishable_abc");
		expect(fetch).toHaveBeenCalledWith(
			"https://backend.example/sub/.well-known/nuvio",
			{ headers: { accept: "application/json" } },
		);
	});

	it.each([
		["another service", answer({ service: "other", publishable_key: "k" })],
		[
			"a key that could split a header",
			answer({ service: "nuvio", publishable_key: "k\r\nx: 1" }),
		],
		["no key", answer({ service: "nuvio" })],
		[
			"an error status",
			answer({ service: "nuvio", publishable_key: "k" }, 404),
		],
		["a body that is not JSON", vi.fn(async () => new Response("<html>"))],
		[
			"a transport failure",
			vi.fn(async () => {
				throw new Error("refused");
			}),
		],
	])("is null for %s, never a throw", async (_name, fetch) => {
		expect(
			await discoverPublishableKey("https://backend.example", fetch as never),
		).toBeNull();
	});
});
