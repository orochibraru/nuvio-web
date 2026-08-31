import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$lib/server/session.js", () => ({
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
	it("ignores 404s", () => {
		expect(
			handleError({ status: 404, event: {}, error: new Error("x") } as any),
		).toBeUndefined();
	});

	it("returns an errorId + message for real errors", () => {
		const result = handleError({
			status: 500,
			event: { request: { method: "GET" }, url: { pathname: "/x" } },
			error: new Error("boom"),
		} as any) as { errorId: string; message: string };
		expect(result.errorId).toMatch(/^[a-f0-9]{24}$/);
		expect(result.message).toBe("boom");
	});
});
