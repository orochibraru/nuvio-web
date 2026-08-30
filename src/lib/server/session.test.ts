import type { Cookies } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: true }));

import {
	clearProfileId,
	clearStoredSession,
	isExpired,
	readProfileId,
	readStoredSession,
	type StoredSession,
	writeProfileId,
	writeStoredSession,
} from "./session.js";

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

const user = { id: "u1", email: "a@b.c" } as StoredSession["user"];

describe("readStoredSession", () => {
	it("returns null with no cookie", () => {
		expect(readStoredSession(fakeCookies().cookies)).toBeNull();
	});

	it("parses a valid session cookie", () => {
		const stored: StoredSession = {
			access_token: "at",
			refresh_token: "rt",
			expires_at: 123,
			user,
		};
		const { cookies } = fakeCookies({ nuvio_session: JSON.stringify(stored) });
		expect(readStoredSession(cookies)).toEqual(stored);
	});

	it("returns null on malformed JSON or missing fields", () => {
		expect(
			readStoredSession(fakeCookies({ nuvio_session: "{oops" }).cookies),
		).toBeNull();
		expect(
			readStoredSession(
				fakeCookies({ nuvio_session: JSON.stringify({ access_token: "x" }) })
					.cookies,
			),
		).toBeNull();
	});
});

describe("writeStoredSession", () => {
	it("stores derived fields and an httpOnly cookie", () => {
		const { cookies, sets } = fakeCookies();
		const result = writeStoredSession(cookies, {
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
});

describe("profile id cookie", () => {
	it("round-trips a valid id", () => {
		const { cookies } = fakeCookies();
		writeProfileId(cookies, 3);
		expect(readProfileId(cookies)).toBe(3);
	});

	it("rejects out-of-range or non-integer values", () => {
		expect(
			readProfileId(fakeCookies({ nuvio_profile: "0" }).cookies),
		).toBeNull();
		expect(
			readProfileId(fakeCookies({ nuvio_profile: "7" }).cookies),
		).toBeNull();
		expect(
			readProfileId(fakeCookies({ nuvio_profile: "abc" }).cookies),
		).toBeNull();
	});

	it("clears both cookies on sign-out", () => {
		const { cookies, deletes } = fakeCookies({
			nuvio_session: "x",
			nuvio_profile: "1",
		});
		clearStoredSession(cookies);
		expect(deletes).toEqual(["nuvio_session", "nuvio_profile"]);
	});

	it("clearProfileId only drops the profile cookie", () => {
		const { cookies, deletes } = fakeCookies({ nuvio_profile: "2" });
		clearProfileId(cookies);
		expect(deletes).toEqual(["nuvio_profile"]);
	});
});

describe("isExpired", () => {
	beforeEach(() => vi.useRealTimers());

	it("is true within the skew window", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(isExpired({ expires_at: now + 30 } as StoredSession)).toBe(true);
		expect(isExpired({ expires_at: now + 30 } as StoredSession, 10)).toBe(
			false,
		);
	});

	it("is false well before expiry", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(isExpired({ expires_at: now + 3600 } as StoredSession)).toBe(false);
	});
});
