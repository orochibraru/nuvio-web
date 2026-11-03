import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
vi.mock("$app/env/private", () => ({
	NUVIO_ADMIN_EMAILS: "",
	NUVIO_DATA_DIR: "data",
}));

// Declared inside `vi.hoisted` : a plain class would not exist yet when the
// `vi.mock` factory below is hoisted above it.
const { FakeApiError, admin, backends, session, store } = vi.hoisted(() => ({
	FakeApiError: class extends Error {},
	store: { deleteAllForUser: vi.fn() },
	admin: { canSignIn: vi.fn(() => true), isLocked: vi.fn(() => false) },
	backends: {
		policy: {
			customAllowed: false,
			defaultBackend: null as null | { url: string; trusted: boolean },
		},
		banned: new Set<string>(),
	},
	session: {
		stored: null as unknown,
		read: vi.fn(),
		clear: vi.fn(),
		profileId: null as number | null,
	},
}));

vi.mock("#lib/nuvio/index.js", () => ({
	NUVIO_BASE_URL: "https://api.nuvio.tv",
	NuvioApiError: FakeApiError,
	NuvioClient: class {},
}));

vi.mock("#lib/admin/admin-data.js", () => ({
	canSignIn: (...args: unknown[]) => admin.canSignIn(...(args as [])),
	isLocked: () => admin.isLocked(),
}));

vi.mock("#lib/admin/backends-data.js", () => ({
	policyOrDefault: (db: unknown) =>
		db ? backends.policy : { customAllowed: false, defaultBackend: null },
	isDefaultBackend: (
		backend: { url: string; trusted: boolean } | null,
		policy: typeof backends.policy,
	) =>
		policy.defaultBackend === null
			? backend === null
			: backend?.trusted === true && backend.url === policy.defaultBackend.url,
	isBannedBackend: (_db: unknown, url: string) => backends.banned.has(url),
}));

import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { DATABASE, LOGGER, SESSION } from "#lib/services/index.js";
import { serverServices } from "#lib/services/server.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { appHandle as handle, handleError } from "./hooks.server.js";

// Swapping implementations is a `register` call now : no module mock, and the
// scope the hook builds per request inherits these.
// `scoped`/`with` return a logger, so the fake returns itself : every
// assertion below can keep looking at the same three spies.
const logger: Record<string, unknown> = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	scoped: () => logger,
	with: () => logger,
};
const database = { tryConnect: vi.fn(() => null as unknown) };

serverServices
	.register(LOGGER, () => logger as never)
	.register(DATABASE, () => database as never)
	.register(SESSION_STORE, () => store as never)
	.register(BUILT_IN_BACKEND, () => ({ owns: () => false }) as never)
	.register(
		SESSION,
		() =>
			({
				read: async () => session.read(),
				clear: () => session.clear(),
				readProfileId: () => session.profileId,
				createNuvioClient: () => ({ marker: "client" }),
			}) as never,
		"scoped",
	);

function storedSession(over: Record<string, unknown> = {}) {
	return {
		access_token: "a",
		refresh_token: "r",
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		user: { id: "u1", email: "someone@example.com" },
		accountKey: "u1",
		backend: null,
		...over,
	};
}

const customBackend = {
	url: "https://backend.example",
	publishableKey: "key",
	trusted: false,
};

function fakeEvent() {
	return {
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		fetch: async () => new Response(),
		url: new URL("http://localhost/x"),
		route: { id: null },
		request: { method: "GET", url: "http://localhost/x" },
		locals: {} as Record<string, unknown>,
	};
}

const ok = vi.fn(async () => new Response("body"));

beforeEach(() => {
	vi.clearAllMocks();
	session.read.mockReturnValue(null);
	session.profileId = null;
	admin.canSignIn.mockReturnValue(true);
	admin.isLocked.mockReturnValue(false);
	backends.policy = { customAllowed: false, defaultBackend: null };
	backends.banned.clear();
	database.tryConnect.mockReturnValue(null);
});

describe("handle", () => {
	it("wires locals and stamps security headers", async () => {
		const event = fakeEvent();
		const response = await handle({ event, resolve: ok } as never);

		expect(event.locals.session).toBeNull();
		expect(event.locals.profileId).toBeNull();
		expect(event.locals.nuvio).toEqual({ marker: "client" });
		expect(response.headers.get("content-security-policy")).toContain(
			"default-src 'self'",
		);
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("strict-transport-security")).toContain(
			"max-age=31536000",
		);
	});

	it("keeps a policy the route set itself", async () => {
		const sandboxed = vi.fn(
			async () =>
				new Response("body", {
					headers: { "content-security-policy": "sandbox" },
				}),
		);
		const response = await handle({
			event: fakeEvent(),
			resolve: sandboxed,
		} as never);

		expect(response.headers.get("content-security-policy")).toBe("sandbox");
	});

	it("exposes the user and the selected profile for a live session", async () => {
		session.read.mockReturnValue(storedSession());
		session.profileId = 3;
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(event.locals.session).toEqual({
			user: { id: "u1", email: "someone@example.com" },
			accountKey: "u1",
			backend: null,
			trusted: true,
		});
		expect(event.locals.profileId).toBe(3);
	});

	it("goes signed-out for this request, keeping the session, when a refresh hits an upstream hiccup", async () => {
		session.read.mockRejectedValue(new FakeApiError("503"));
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(session.clear).not.toHaveBeenCalled();
		expect(event.locals.session).toBeNull();
	});

	it("rethrows a session failure that is not an API error", async () => {
		session.read.mockRejectedValue(new TypeError("network down"));

		await expect(
			handle({ event: fakeEvent(), resolve: ok } as never),
		).rejects.toThrow("network down");
	});

	it("signs out an existing session once the instance is locked", async () => {
		session.read.mockReturnValue(storedSession());
		database.tryConnect.mockReturnValue({ marker: "db" });
		admin.canSignIn.mockReturnValue(false);
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(session.clear).toHaveBeenCalled();
		expect(store.deleteAllForUser).toHaveBeenCalledWith("u1");
		expect(event.locals.session).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			"Signed out an existing session: not allowed",
			{ email: "someone@example.com", backend: "official" },
		);
	});

	it("keeps a session the lock still allows", async () => {
		session.read.mockReturnValue(storedSession());
		database.tryConnect.mockReturnValue({ marker: "db" });
		admin.canSignIn.mockReturnValue(true);
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(session.clear).not.toHaveBeenCalled();
		expect(event.locals.session).not.toBeNull();
	});

	it("keeps an allowed custom-backend session, untrusted and keyed apart", async () => {
		backends.policy.customAllowed = true;
		session.read.mockReturnValue(
			storedSession({ accountKey: "custom-x", backend: customBackend }),
		);
		database.tryConnect.mockReturnValue({ marker: "db" });
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(event.locals.session).toMatchObject({
			accountKey: "custom-x",
			backend: "https://backend.example",
			trusted: false,
		});
		// Its email never reaches the allowlist.
		expect(admin.canSignIn).not.toHaveBeenCalled();
	});

	it.each([
		["the admin disallows custom backends", () => {}],
		[
			"its backend is banned",
			() => {
				backends.policy.customAllowed = true;
				backends.banned.add(customBackend.url);
			},
		],
		[
			"the instance is locked",
			() => {
				backends.policy.customAllowed = true;
				admin.isLocked.mockReturnValue(true);
			},
		],
	])("signs out a custom-backend session when %s", async (_case, arrange) => {
		arrange();
		session.read.mockReturnValue(
			storedSession({ accountKey: "custom-x", backend: customBackend }),
		);
		database.tryConnect.mockReturnValue({ marker: "db" });
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(store.deleteAllForUser).toHaveBeenCalledWith("custom-x");
		expect(event.locals.session).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			"Signed out an existing session: not allowed",
			{ email: "someone@example.com", backend: "https://backend.example" },
		);
	});

	it("trusts the admin default, and drops a session on a default since replaced", async () => {
		const lan = {
			url: "http://192.168.1.10",
			publishableKey: "k",
			trusted: true,
		};
		backends.policy.defaultBackend = lan;
		database.tryConnect.mockReturnValue({ marker: "db" });
		session.read.mockReturnValue(
			storedSession({ accountKey: "custom-lan", backend: lan }),
		);
		const kept = fakeEvent();
		await handle({ event: kept, resolve: ok } as never);
		expect(kept.locals.session).toMatchObject({ trusted: true });

		backends.policy.defaultBackend = { ...lan, url: "http://10.0.0.2" };
		backends.policy.customAllowed = true;
		const dropped = fakeEvent();
		await handle({ event: dropped, resolve: ok } as never);
		expect(dropped.locals.session).toBeNull();
		expect(store.deleteAllForUser).toHaveBeenCalledWith("custom-lan");
	});

	it("logs the access line at the level the status deserves", async () => {
		await handle({
			event: fakeEvent(),
			resolve: async () => new Response("", { status: 500 }),
		} as never);
		expect(logger.error).toHaveBeenCalledWith("GET /x", expect.anything());

		await handle({
			event: fakeEvent(),
			resolve: async () => new Response("", { status: 404 }),
		} as never);
		expect(logger.warn).toHaveBeenCalledWith("GET /x", expect.anything());

		await handle({ event: fakeEvent(), resolve: ok } as never);
		expect(logger.info).toHaveBeenCalledWith("GET /x", expect.anything());
	});

	it("logs no access line for remote calls or revalidation", async () => {
		await handle({
			event: { ...fakeEvent(), isRemoteRequest: true },
			resolve: ok,
		} as never);
		await handle({
			event: { ...fakeEvent(), isDataRequest: true },
			resolve: ok,
		} as never);
		expect(logger.info).not.toHaveBeenCalledWith("GET /x", expect.anything());
	});

	it("logs no access line for SvelteKit's own paths", async () => {
		for (const path of [
			"/x/__data.json",
			"/_app/immutable/a.js",
			"/@vite/client",
		]) {
			await handle({
				event: {
					...fakeEvent(),
					url: new URL(`http://localhost${path}`),
					request: { method: "GET", url: `http://localhost${path}` },
				},
				resolve: ok,
			} as never);
		}
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("lets the browser keep addon meta for 15 minutes, and nothing else", async () => {
		const cacheControl = async (over: Record<string, unknown>) =>
			(
				await handle({
					event: { ...fakeEvent(), ...over },
					resolve: ok,
				} as never)
			).headers.get("cache-control");
		const detailData = (mask: string) => ({
			isDataRequest: true,
			route: { id: "/(protected)/(app)/(watch)/detail/[type]/[id]" },
			request: {
				method: "GET",
				url: `http://localhost/detail/movie/tt1/__data.json?x-sveltekit-invalidated=${mask}`,
			},
		});

		expect(await cacheControl(detailData("001"))).toBe("private, max-age=900");
		// `invalidateAll()` (a Retry button) must reach the server.
		expect(await cacheControl(detailData("111"))).toBeNull();
		expect(
			await cacheControl({
				isRemoteRequest: true,
				url: new URL("http://localhost/_app/remote/abc/getMeta"),
			}),
		).toBe("private, max-age=900");
		expect(
			await cacheControl({
				isRemoteRequest: true,
				url: new URL("http://localhost/_app/remote/abc/resolveStreams"),
			}),
		).toBeNull();
		expect(await cacheControl({})).toBeNull();
	});

	it("disposes the request scope even when the route throws", async () => {
		const event = fakeEvent();
		await expect(
			handle({
				event,
				resolve: async () => {
					throw new Error("route blew up");
				},
			} as never),
		).rejects.toThrow("route blew up");
		expect(event.locals.services).toBeDefined();
	});
});

describe("handleError", () => {
	it("ignores framework 404s", () => {
		expect(
			handleError({
				kind: "framework",
				event: {},
				error: { status: 404, message: "Not Found" },
			} as never),
		).toBeUndefined();
	});

	it("returns an errorId, hiding the real message from the client outside dev", () => {
		const result = handleError({
			kind: "unknown",
			event: { request: { method: "GET" }, url: { pathname: "/x" } },
			error: new Error("boom"),
		} as never) as { errorId: string; message: string };
		expect(result.errorId).toMatch(/^[a-f0-9]{24}$/);
		expect(result.message).toBe("An unknown error occurred.");
		expect(logger.error).toHaveBeenCalledWith(
			"Error on GET /x",
			expect.objectContaining({ errorId: result.errorId }),
		);
	});

	it("keeps the readable part of a non-Error throw in the log", () => {
		handleError({
			kind: "unknown",
			event: { request: { method: "POST" }, url: { pathname: "/y" } },
			error: "a string",
		} as never);
		expect(logger.error).toHaveBeenCalledWith(
			"Error on POST /y",
			expect.objectContaining({ error: "a string" }),
		);
	});

	it("warns rather than errors on a deliberate `error(...)`, and keeps its message", () => {
		const result = handleError({
			kind: "app",
			event: { request: { method: "GET" }, url: { pathname: "/z" } },
			error: { message: "This addon isn't installed" },
		} as never) as { errorId: string; message?: string };
		// Omitting `message` is what makes SvelteKit fall back to the body the
		// route passed to `error(...)` : the text written for the user.
		expect(result.message).toBeUndefined();
		expect(result.errorId).toMatch(/^[a-f0-9]{24}$/);
		expect(logger.error).not.toHaveBeenCalledWith(
			"Error on GET /z",
			expect.anything(),
		);
		expect(logger.warn).toHaveBeenCalledWith(
			"Error on GET /z",
			expect.objectContaining({ error: "This addon isn't installed" }),
		);
	});
});
