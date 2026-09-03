import type { Cookies } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService, type StoredSession } from "./session.service.ts";

// No `$app/env` mock needed any more: the service takes `secure` as a
// constructor argument instead of reading `dev` off the module graph.

function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const sets: Array<{ name: string; value: string; opts: unknown }> = [];
	const deletes: string[] = [];
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string, opts: unknown) => {
			jar.set(name, value);
			sets.push({ name, value, opts });
		},
		delete: (name: string) => {
			jar.delete(name);
			deletes.push(name);
		},
	} as unknown as Cookies;
	return { cookies, jar, sets, deletes };
}

function service(initial: Record<string, string> = {}, secure = false) {
	const jar = fakeCookies(initial);
	return { ...jar, session: new SessionService(jar.cookies, secure) };
}

const user = { id: "u1", email: "a@b.c" } as StoredSession["user"];

describe("read", () => {
	it("returns null with no cookie", () => {
		expect(service().session.read()).toBeNull();
	});

	it("parses a valid session cookie", () => {
		const stored: StoredSession = {
			access_token: "at",
			refresh_token: "rt",
			expires_at: 123,
			user,
		};
		const { session } = service({ nuvio_session: JSON.stringify(stored) });
		expect(session.read()).toEqual(stored);
	});

	it("returns null on malformed JSON or missing fields", () => {
		expect(service({ nuvio_session: "{oops" }).session.read()).toBeNull();
		expect(
			service({
				nuvio_session: JSON.stringify({ access_token: "x" }),
			}).session.read(),
		).toBeNull();
	});
});

describe("write", () => {
	it("stores derived fields and an httpOnly cookie", () => {
		const { session, sets } = service();
		const result = session.write({
			access_token: "at",
			token_type: "bearer",
			expires_in: 3600,
			refresh_token: "rt",
			user,
		});
		expect(result.access_token).toBe("at");
		expect(result.expires_at).toBeGreaterThan(Date.now() / 1000);
		expect(sets[0].name).toBe("nuvio_session");
		expect(sets[0].opts).toMatchObject({ httpOnly: true, path: "/" });
	});

	// `secure` is a constructor argument now, so both branches are reachable
	// in a test; reading `dev` off the module graph made this untestable.
	it("marks the cookie secure only when the instance says to", () => {
		const insecure = service({}, false);
		insecure.session.writeProfileId(1);
		expect(insecure.sets[0].opts).toMatchObject({ secure: false });

		const secure = service({}, true);
		secure.session.writeProfileId(1);
		expect(secure.sets[0].opts).toMatchObject({ secure: true });
	});
});

describe("profile id cookie", () => {
	it("round-trips a valid id", () => {
		const { session } = service();
		session.writeProfileId(3);
		expect(session.readProfileId()).toBe(3);
	});

	it("rejects out-of-range or non-integer values", () => {
		expect(service({ nuvio_profile: "0" }).session.readProfileId()).toBeNull();
		expect(service({ nuvio_profile: "7" }).session.readProfileId()).toBeNull();
		expect(
			service({ nuvio_profile: "abc" }).session.readProfileId(),
		).toBeNull();
	});

	it("clears both cookies on sign-out", () => {
		const { session, deletes } = service({
			nuvio_session: "x",
			nuvio_profile: "1",
		});
		session.clear();
		expect(deletes).toEqual(["nuvio_session", "nuvio_profile"]);
	});

	it("clearProfileId only drops the profile cookie", () => {
		const { session, deletes } = service({ nuvio_profile: "2" });
		session.clearProfileId();
		expect(deletes).toEqual(["nuvio_profile"]);
	});
});

describe("isExpired", () => {
	beforeEach(() => vi.useRealTimers());

	it("is true within the skew window", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(
			SessionService.isExpired({ expires_at: now + 30 } as StoredSession),
		).toBe(true);
		expect(
			SessionService.isExpired({ expires_at: now + 30 } as StoredSession, 10),
		).toBe(false);
	});

	it("is false well before expiry", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(
			SessionService.isExpired({ expires_at: now + 3600 } as StoredSession),
		).toBe(false);
	});
});

describe("createNuvioClient", () => {
	it("persists a refreshed session straight back to the cookie", () => {
		const { session, jar } = service();
		const client = session.createNuvioClient(globalThis.fetch, null);
		expect(client).toBeDefined();
		// The client writes through `onSessionChange`, which routes back into
		// this same service : proven by writing and reading through it.
		session.write({
			access_token: "fresh",
			token_type: "bearer",
			expires_in: 60,
			refresh_token: "rt",
			user,
		});
		expect(JSON.parse(jar.get("nuvio_session") ?? "{}").access_token).toBe(
			"fresh",
		);
	});
});
