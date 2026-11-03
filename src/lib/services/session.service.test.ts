import { Database } from "bun:sqlite";
import type { Cookies } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "#lib/nuvio/index.js";
import { DatabaseService } from "./database.service.ts";
import { Logger } from "./logger.service.ts";
import {
	SessionService,
	signSessionValue,
	verifySessionValue,
} from "./session.service.ts";
import { SessionStore } from "./session-store.service.ts";

const SECRET = "test-secret";

let db: Database;
let store: SessionStore;
const refresher =
	vi.fn<(token: string, backend: unknown) => Promise<AuthSession>>();

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	refresher.mockReset();
	store = new SessionStore(
		{ tryConnect: () => db },
		SECRET,
		refresher,
		new Logger("error", { out: () => {}, err: () => {} }),
	);
});

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
	return {
		...jar,
		session: new SessionService(jar.cookies, secure, SECRET, store),
	};
}

const user = { id: "u1", email: "a@b.c" } as AuthSession["user"];

function auth(over: Partial<AuthSession> = {}): AuthSession {
	return {
		access_token: "at",
		token_type: "bearer",
		expires_in: 3600,
		refresh_token: "rt",
		user,
		...over,
	};
}

function rowCount(): number {
	return (
		db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sessions").get()
			?.n ?? 0
	);
}

describe("read", () => {
	it("returns null with no cookie", async () => {
		expect(await service().session.read()).toBeNull();
	});

	it("round-trips through write(), keeping only the signed id in the cookie", async () => {
		const { session, jar } = service();
		const written = session.write(auth());
		const cookie = jar.get("nuvio_session") ?? "";
		expect(verifySessionValue(cookie, SECRET)).toBe(written.id);
		expect(await session.read()).toEqual({
			...written,
			expires_at: expect.any(Number),
		});
	});

	it("reads an old-format cookie (signed or unsigned session JSON) as signed-out", async () => {
		const legacy = {
			access_token: "at",
			refresh_token: "rt",
			expires_at: 9e9,
			user: { id: "x", email: "admin@b.c" },
		};
		const signed = signSessionValue(JSON.stringify(legacy), SECRET);
		expect(await service({ nuvio_session: signed }).session.read()).toBeNull();
		expect(
			await service({ nuvio_session: JSON.stringify(legacy) }).session.read(),
		).toBeNull();
	});

	it("rejects an id signed with another key, and a forged one", async () => {
		const { session, jar } = service();
		const { id } = session.write(auth());
		expect(
			await service({
				nuvio_session: signSessionValue(id, "other"),
			}).session.read(),
		).toBeNull();
		const [, mac] = (jar.get("nuvio_session") ?? "").split(".");
		const forged = `${Buffer.from("A".repeat(43)).toString("base64url")}.${mac}`;
		expect(await service({ nuvio_session: forged }).session.read()).toBeNull();
	});

	it("drops the cookie when its session is gone", async () => {
		const cookie = signSessionValue("A".repeat(43), SECRET);
		const { session, deletes } = service({ nuvio_session: cookie });
		expect(await session.read()).toBeNull();
		expect(deletes).toEqual(["nuvio_session"]);
	});

	it("refreshes through the store when the session is due", async () => {
		const { session } = service();
		session.write(auth({ expires_in: 0 }));
		refresher.mockResolvedValue(
			auth({ access_token: "at2", refresh_token: "rt2" }),
		);
		expect((await session.read())?.access_token).toBe("at2");
		expect(refresher).toHaveBeenCalledWith("rt", null);
	});
});

describe("verifySessionValue", () => {
	it("rejects a value with no MAC", () => {
		expect(verifySessionValue("abc", SECRET)).toBeNull();
	});
});

describe("write", () => {
	it("sets an httpOnly cookie", () => {
		const { session, sets } = service();
		const result = session.write(auth());
		expect(result.expires_at).toBeGreaterThan(Date.now() / 1000);
		expect(sets[0].name).toBe("nuvio_session");
		expect(sets[0].opts).toMatchObject({ httpOnly: true, path: "/" });
	});

	it("replaces this browser's previous session rather than orphaning it", () => {
		const { session } = service();
		session.write(auth());
		session.write(auth());
		expect(rowCount()).toBe(1);
	});

	// `secure` is a constructor argument, so both branches are reachable in a
	// test; reading `dev` off the module graph made this untestable.
	it("marks the cookie secure only when the instance says to", () => {
		const insecure = service({}, false);
		insecure.session.write(auth());
		insecure.session.writeProfileId(1, true);
		expect(insecure.sets[1].opts).toMatchObject({ secure: false });

		const secure = service({}, true);
		secure.session.write(auth());
		secure.session.writeProfileId(1, true);
		expect(secure.sets[1].opts).toMatchObject({ secure: true });
	});
});

describe("clear", () => {
	it("deletes the store session and both cookies on sign-out", () => {
		const { session, deletes } = service({ nuvio_profile: "1" });
		session.write(auth());
		session.clear();
		expect(rowCount()).toBe(0);
		expect(deletes).toEqual(["nuvio_session", "nuvio_profile"]);
	});
});

describe("profile id cookie", () => {
	function signedIn() {
		const jar = service();
		const { id } = jar.session.write(auth());
		return { ...jar, sessionId: id };
	}

	it("round-trips a valid id", () => {
		const { session } = signedIn();
		session.writeProfileId(3, true);
		expect(session.readProfileId()).toBe(3);
	});

	it("keeps the pick for 30 days only when asked to remember it", () => {
		const remembered = signedIn();
		remembered.session.writeProfileId(2, true);
		expect(remembered.sets.at(-1)?.opts).toMatchObject({
			maxAge: 60 * 60 * 24 * 30,
		});

		const forgotten = signedIn();
		forgotten.session.writeProfileId(2, false);
		expect(forgotten.sets.at(-1)?.opts).not.toHaveProperty("maxAge");
		expect(forgotten.sets.at(-1)?.opts).toMatchObject({
			httpOnly: true,
			path: "/",
		});
		expect(forgotten.session.readProfileId()).toBe(2);
	});

	it("writes nothing without a session", () => {
		const { session, sets } = service();
		session.writeProfileId(3, true);
		expect(sets).toEqual([]);
	});

	it("rejects an unsigned or forged cookie", () => {
		const { session, jar, sessionId } = signedIn();
		jar.set("nuvio_profile", "2");
		expect(session.readProfileId()).toBeNull();
		jar.set("nuvio_profile", signSessionValue(`${sessionId}:2`, "other"));
		expect(session.readProfileId()).toBeNull();
	});

	it("rejects a cookie bound to another session", () => {
		const first = signedIn();
		first.session.writeProfileId(2, true);
		const second = signedIn();
		second.jar.set("nuvio_profile", first.jar.get("nuvio_profile") ?? "");
		expect(second.session.readProfileId()).toBeNull();
	});

	it("drops the profile on a new sign-in", () => {
		const { session } = signedIn();
		session.writeProfileId(2, true);
		session.write(auth());
		expect(session.readProfileId()).toBeNull();
	});

	it("rejects out-of-range or non-integer values", () => {
		const { session, jar, sessionId } = signedIn();
		for (const value of ["0", "7", "abc", ""]) {
			jar.set(
				"nuvio_profile",
				signSessionValue(`${sessionId}:${value}`, SECRET),
			);
			expect(session.readProfileId()).toBeNull();
		}
		jar.set("nuvio_profile", signSessionValue(sessionId, SECRET));
		expect(session.readProfileId()).toBeNull();
	});

	it("clearProfileId only drops the profile cookie", () => {
		const { session, deletes } = service({ nuvio_profile: "2" });
		session.clearProfileId();
		expect(deletes).toEqual(["nuvio_profile"]);
	});
});

describe("createNuvioClient", () => {
	it("routes an upstream sign-out back into clear()", async () => {
		const { session } = service();
		const stored = session.write(auth());
		const client = session.createNuvioClient(globalThis.fetch, stored);
		expect(client.session?.access_token).toBe("at");
		client.setSession(null);
		expect(rowCount()).toBe(0);
	});

	it("routes a new upstream session into write()", () => {
		const { session } = service();
		const client = session.createNuvioClient(globalThis.fetch, null);
		client.setSession(auth());
		expect(rowCount()).toBe(1);
	});

	it("builds a custom-backend session's client against that backend, keeping its guarded fetch", async () => {
		const { session } = service();
		const backend = {
			url: "https://backend.example",
			publishableKey: "custom-key",
			trusted: false,
		};
		const stored = session.write(auth(), backend);
		expect(stored.accountKey).toMatch(/^custom-/);
		const requestFetch = vi.fn() as unknown as typeof fetch;
		const client = session.createNuvioClient(requestFetch, stored);
		expect(client.baseUrl).toBe("https://backend.example");
		expect(client.publishableKey).toBe("custom-key");
		const forLoad = client.withFetch(requestFetch);
		expect(forLoad.baseUrl).toBe("https://backend.example");
		expect(
			(forLoad as unknown as { fetchImplementation: unknown })
				.fetchImplementation,
		).not.toBe(requestFetch);
		await expect(session.read()).resolves.toMatchObject({ backend });
	});
});
