import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// No admin database in unit tests: `tryDb` returning null is the documented
// "feature disabled" path, so the hook must behave exactly as it did before.
vi.mock("#lib/server/db.js", () => ({ tryDb: () => null }));
vi.mock("$app/env/private", () => ({
	NUVIO_ADMIN_EMAILS: "",
	NUVIO_DATA_DIR: "data",
}));
vi.mock("#lib/server/session.js", () => ({
	readStoredSession: () => null,
	createServerClient: () => ({ marker: "client" }),
	isExpired: () => false,
	readProfileId: () => null,
	writeStoredSession: () => ({}),
	clearStoredSession: () => {},
}));

import { handle, handleError } from "./hooks.server.js";

function fakeEvent() {
	return {
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		fetch: async () => new Response(),
		url: new URL("http://localhost/"),
		request: { method: "GET" },
		locals: {} as Record<string, unknown>,
	};
}

describe("handle", () => {
	it("wires locals and stamps security headers", async () => {
		const event = fakeEvent();
		const resolve = vi.fn(async () => new Response("body", { headers: {} }));

		const response = await handle({ event, resolve } as any);

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
});

describe("handleError", () => {
	it("ignores framework 404s", () => {
		expect(
			handleError({
				kind: "framework",
				event: {},
				error: { status: 404, message: "Not Found" },
			} as any),
		).toBeUndefined();
	});

	it("returns an errorId, hiding the real message from the client outside dev", () => {
		const result = handleError({
			kind: "unknown",
			event: { request: { method: "GET" }, url: { pathname: "/x" } },
			error: new Error("boom"),
		} as any) as { errorId: string; message: string };
		expect(result.errorId).toMatch(/^[a-f0-9]{24}$/);
		expect(result.message).toBe("An unknown error occurred.");
	});
});
