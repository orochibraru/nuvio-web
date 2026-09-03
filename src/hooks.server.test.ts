import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
vi.mock("$app/env/private", () => ({
	NUVIO_ADMIN_EMAILS: "",
	NUVIO_DATA_DIR: "data",
}));

// Declared inside `vi.hoisted` : a plain class would not exist yet when the
// `vi.mock` factory below is hoisted above it.
const { FakeApiError, nuvio, admin, session } = vi.hoisted(() => ({
	FakeApiError: class extends Error {},
	nuvio: { refreshSession: vi.fn() },
	admin: { canSignIn: vi.fn(() => true) },
	session: {
		stored: null as unknown,
		read: vi.fn(),
		write: vi.fn(),
		clear: vi.fn(),
		profileId: null as number | null,
	},
}));

vi.mock("#lib/nuvio/index.js", () => ({
	NuvioApiError: FakeApiError,
	NuvioClient: class {
		refreshSession(token: string) {
			return nuvio.refreshSession(token);
		}
	},
}));

vi.mock("#lib/admin/admin-data.js", () => ({
	canSignIn: (...args: unknown[]) => admin.canSignIn(...(args as [])),
}));

import { DATABASE, LOGGER, SESSION } from "#lib/services/index.js";
import { serverServices } from "#lib/services/server.js";
import { handle, handleError } from "./hooks.server.js";

// Swapping implementations is a `register` call now : no module mock, and the
// scope the hook builds per request inherits these.
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const database = { tryConnect: vi.fn(() => null as unknown) };

serverServices
	.register(LOGGER, () => logger as never)
	.register(DATABASE, () => database as never)
	.register(
		SESSION,
		() =>
			({
				read: () => session.read(),
				write: (value: unknown) => session.write(value),
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
		user: { email: "someone@example.com" },
		...over,
	};
}

function fakeEvent() {
	return {
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		fetch: async () => new Response(),
		url: new URL("http://localhost/x"),
		request: { method: "GET" },
		locals: {} as Record<string, unknown>,
	};
}

const ok = vi.fn(async () => new Response("body"));

beforeEach(() => {
	vi.clearAllMocks();
	session.read.mockReturnValue(null);
	session.profileId = null;
	admin.canSignIn.mockReturnValue(true);
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

	it("exposes the user and the selected profile for a live session", async () => {
		session.read.mockReturnValue(storedSession());
		session.profileId = 3;
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(event.locals.session).toEqual({
			user: { email: "someone@example.com" },
		});
		expect(event.locals.profileId).toBe(3);
		expect(nuvio.refreshSession).not.toHaveBeenCalled();
	});

	it("refreshes an expired session and keeps the request signed in", async () => {
		const expired = storedSession({ expires_at: 0 });
		const refreshed = storedSession({ access_token: "new" });
		session.read.mockReturnValue(expired);
		session.write.mockReturnValue(refreshed);
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(nuvio.refreshSession).toHaveBeenCalledWith("r");
		expect(event.locals.session).toEqual({
			user: { email: "someone@example.com" },
		});
	});

	it("clears the cookie when the upstream refuses the refresh", async () => {
		session.read.mockReturnValue(storedSession({ expires_at: 0 }));
		nuvio.refreshSession.mockRejectedValue(new FakeApiError("expired"));
		const event = fakeEvent();

		await handle({ event, resolve: ok } as never);

		expect(session.clear).toHaveBeenCalled();
		expect(event.locals.session).toBeNull();
	});

	it("rethrows a refresh failure that is not an API error", async () => {
		session.read.mockReturnValue(storedSession({ expires_at: 0 }));
		nuvio.refreshSession.mockRejectedValue(new TypeError("network down"));

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
		expect(event.locals.session).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			"Signed out an existing session: instance is locked",
			{ email: "someone@example.com" },
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

	it("logs a non-Error throw as unknown", () => {
		handleError({
			kind: "unknown",
			event: { request: { method: "POST" }, url: { pathname: "/y" } },
			error: "a string",
		} as never);
		expect(logger.error).toHaveBeenCalledWith(
			"Error on POST /y",
			expect.objectContaining({ error: "Unknown error" }),
		);
	});
});
