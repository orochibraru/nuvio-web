import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthSession, NuvioApiError } from "#lib/nuvio/index.js";
import { DatabaseService } from "./database.service.ts";
import { Logger } from "./logger.service.ts";
import {
	isSessionId,
	SESSION_IDLE_SECONDS,
	SessionStore,
} from "./session-store.service.ts";

const SECRET = "test-secret-test-secret-test-secret";
const logger = new Logger("error", { out: () => {}, err: () => {} });

let db: Database;
let refresher: ReturnType<
	typeof vi.fn<(token: string) => Promise<AuthSession>>
>;
let store: SessionStore;

function auth(over: Partial<AuthSession> = {}): AuthSession {
	return {
		access_token: "at",
		token_type: "bearer",
		expires_in: 3600,
		refresh_token: "rt",
		user: { id: "u1", email: "a@b.c" } as AuthSession["user"],
		...over,
	};
}

function now(): number {
	return Math.floor(Date.now() / 1000);
}

function row(id: string) {
	return db
		.query<Record<string, string | number>, [string]>(
			"SELECT * FROM sessions WHERE id = ?",
		)
		.get(id);
}

function apiError(status: number) {
	return new NuvioApiError(status, {}, `status ${status}`);
}

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	refresher = vi.fn();
	store = new SessionStore({ tryConnect: () => db }, SECRET, refresher, logger);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("encryption", () => {
	it("round-trips, and never stores the token in the clear", () => {
		const id = store.create(auth({ access_token: "secret-access" }));
		expect(isSessionId(id)).toBe(true);
		expect(JSON.stringify(row(id))).not.toContain("secret-access");
		expect(store.get(id)?.access_token).toBe("secret-access");
		expect(store.decrypt(id, store.encrypt(id, "x"))).toBe("x");
	});

	it("rejects tampered ciphertext, another row's id, or another key", () => {
		const sealed = store.encrypt("id-a", "token");
		const bytes = Buffer.from(sealed, "base64url");
		bytes[bytes.length - 1] ^= 1;
		expect(() => store.decrypt("id-a", bytes.toString("base64url"))).toThrow();
		expect(() => store.decrypt("id-b", sealed)).toThrow();
		const other = new SessionStore(
			{ tryConnect: () => db },
			"another-secret",
			refresher,
			logger,
		);
		expect(() => other.decrypt("id-a", sealed)).toThrow();
	});

	it("drops a row it cannot decrypt (the secret changed)", () => {
		const id = store.create(auth());
		const other = new SessionStore(
			{ tryConnect: () => db },
			"another-secret",
			refresher,
			logger,
		);
		expect(other.get(id)).toBeNull();
		expect(row(id)).toBeNull();
	});
});

describe("create / get / delete", () => {
	it("returns the user and expiry it was given", () => {
		const id = store.create(auth());
		expect(store.get(id)).toMatchObject({
			id,
			refresh_token: "rt",
			user: { id: "u1", email: "a@b.c" },
		});
		expect(store.get(id)?.expires_at).toBeGreaterThanOrEqual(now() + 3599);
	});

	it("deletes one session, or all of a user's", () => {
		const a = store.create(auth());
		const b = store.create(auth());
		const other = store.create(auth({ user: { id: "u2" } as never }));
		store.delete(a);
		expect(store.get(a)).toBeNull();
		store.deleteAllForUser("u1");
		expect(store.get(b)).toBeNull();
		expect(store.get(other)).not.toBeNull();
	});

	it("treats a session idle past the limit as gone, and prunes it on the next sign-in", () => {
		vi.useFakeTimers();
		const stale = store.create(auth());
		vi.setSystemTime(Date.now() + (SESSION_IDLE_SECONDS + 1) * 1000);
		expect(store.get(stale)).toBeNull();
		store.create(auth());
		expect(row(stale)).toBeNull();
	});

	it("touch bumps last_seen_at, at most once a minute", () => {
		vi.useFakeTimers();
		const id = store.create(auth());
		const first = row(id)?.last_seen_at;
		vi.setSystemTime(Date.now() + 30_000);
		store.touch(id);
		expect(row(id)?.last_seen_at).toBe(first);
		vi.setSystemTime(Date.now() + 60_000);
		store.touch(id);
		expect(row(id)?.last_seen_at).toBe(now());
	});

	it("degrades to signed-out without a database, and refuses to create", async () => {
		const offline = new SessionStore(
			{ tryConnect: () => null },
			SECRET,
			refresher,
			logger,
		);
		expect(offline.get("x")).toBeNull();
		expect(() => offline.create(auth())).toThrow("Session store unavailable");
		expect(await offline.accessTokenFor("u1")).toBeNull();
		offline.touch("x");
		offline.delete("x");
		offline.deleteAllForUser("u1");
	});
});

describe("fresh", () => {
	it("hands back a live session without refreshing", async () => {
		const id = store.create(auth());
		expect((await store.fresh(id))?.access_token).toBe("at");
		expect(refresher).not.toHaveBeenCalled();
	});

	it("is null for an unknown id", async () => {
		expect(await store.fresh("nope")).toBeNull();
	});

	it("refreshes an expiring session and persists the rotated refresh token", async () => {
		const id = store.create(auth({ expires_in: 30 }));
		refresher.mockResolvedValue(
			auth({ access_token: "at2", refresh_token: "rt2" }),
		);
		const fresh = await store.fresh(id);
		expect(refresher).toHaveBeenCalledWith("rt");
		expect(fresh).toMatchObject({ access_token: "at2", refresh_token: "rt2" });
		// Persisted: a later read (another request, the sync) sees the new pair
		// and does not refresh again.
		expect(store.get(id)).toMatchObject({
			access_token: "at2",
			refresh_token: "rt2",
		});
		await store.fresh(id);
		expect(refresher).toHaveBeenCalledTimes(1);
	});

	it("single-flights concurrent refreshes of one session", async () => {
		const id = store.create(auth({ expires_in: 0 }));
		let release: (value: AuthSession) => void = () => {};
		refresher.mockReturnValue(
			new Promise((resolve) => {
				release = resolve;
			}),
		);
		const first = store.fresh(id);
		const second = store.fresh(id);
		const viaSync = store.accessTokenFor("u1");
		release(auth({ access_token: "at2", refresh_token: "rt2" }));
		expect((await first)?.access_token).toBe("at2");
		expect((await second)?.access_token).toBe("at2");
		expect(await viaSync).toBe("at2");
		expect(refresher).toHaveBeenCalledTimes(1);
	});

	it("deletes the session when upstream refuses the refresh", async () => {
		const id = store.create(auth({ expires_in: 0 }));
		refresher.mockRejectedValue(apiError(400));
		expect(await store.fresh(id)).toBeNull();
		expect(row(id)).toBeNull();
	});

	it("keeps the session and throws on a transient failure", async () => {
		const id = store.create(auth({ expires_in: 0 }));
		refresher.mockRejectedValueOnce(apiError(503));
		await expect(store.fresh(id)).rejects.toThrow("status 503");
		expect(row(id)).not.toBeNull();
		// The failed flight is not cached: the next caller tries again.
		refresher.mockResolvedValueOnce(auth({ access_token: "at2" }));
		expect((await store.fresh(id))?.access_token).toBe("at2");
	});
});

describe("accessTokenFor", () => {
	it("picks the most recently seen live session", async () => {
		vi.useFakeTimers();
		const older = store.create(auth({ access_token: "older" }));
		vi.setSystemTime(Date.now() + 120_000);
		store.create(auth({ access_token: "newer" }));
		expect(await store.accessTokenFor("u1")).toBe("newer");

		vi.setSystemTime(Date.now() + 120_000);
		store.touch(older);
		expect(await store.accessTokenFor("u1")).toBe("older");
	});

	it("falls through to the next session when the most recent one is dead", async () => {
		vi.useFakeTimers();
		store.create(auth({ access_token: "fallback" }));
		vi.setSystemTime(Date.now() + 120_000);
		const dead = store.create(auth({ expires_in: 0 }));
		refresher.mockRejectedValue(apiError(401));
		expect(await store.accessTokenFor("u1")).toBe("fallback");
		expect(row(dead)).toBeNull();
	});

	it("is null for a user with no session here", async () => {
		expect(await store.accessTokenFor("nobody")).toBeNull();
	});
});
