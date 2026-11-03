import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "#lib/services/database.service.js";
import {
	backendPolicy,
	isBannedBackend,
	isDefaultBackend,
	listSeenBackends,
	policyOrDefault,
	pullBackendRequests,
	recordCustomSignIn,
	setBackendBanned,
	setCustomBackendsAllowed,
	setDefaultBackend,
	testBackend,
} from "./backends-data.ts";

let db: Database;

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
});

describe("policy", () => {
	it("defaults to the official API with custom backends off", () => {
		expect(backendPolicy(db)).toEqual({
			customAllowed: false,
			defaultBackend: null,
		});
		expect(policyOrDefault(null)).toEqual(backendPolicy(db));
	});

	it("stores the toggle and a default backend that replaces the official one", () => {
		setCustomBackendsAllowed(db, true);
		setDefaultBackend(db, {
			url: "http://192.168.1.10:8000",
			publishableKey: "anon",
		});
		expect(backendPolicy(db)).toEqual({
			customAllowed: true,
			defaultBackend: {
				url: "http://192.168.1.10:8000",
				publishableKey: "anon",
				trusted: true,
			},
		});
	});

	it("goes back to the official API for null or the official URL", () => {
		setDefaultBackend(db, { url: "https://self.example", publishableKey: "k" });
		setDefaultBackend(db, { url: "https://api.nuvio.tv", publishableKey: "k" });
		expect(backendPolicy(db).defaultBackend).toBeNull();
		setDefaultBackend(db, { url: "https://self.example", publishableKey: "k" });
		setDefaultBackend(db, null);
		expect(backendPolicy(db).defaultBackend).toBeNull();
	});

	it("ignores a stored default that no longer validates", () => {
		db.run(
			"INSERT INTO settings (key, value) VALUES ('backends.default_url', 'https://x.example'), ('backends.default_key', 'bad key\r\nx')",
		);
		expect(backendPolicy(db).defaultBackend).toBeNull();
	});
});

describe("isDefaultBackend", () => {
	const official = { customAllowed: true, defaultBackend: null };
	const lan = {
		url: "http://192.168.1.10",
		publishableKey: "k",
		trusted: true,
	};
	const replaced = { customAllowed: true, defaultBackend: lan };

	it("is the official API unless an admin set a default", () => {
		expect(isDefaultBackend(null, official)).toBe(true);
		expect(isDefaultBackend({ ...lan, trusted: false }, official)).toBe(false);
	});

	it("is only the admin's default once one is set", () => {
		expect(isDefaultBackend(lan, replaced)).toBe(true);
		expect(isDefaultBackend(null, replaced)).toBe(false);
		expect(isDefaultBackend({ ...lan, trusted: false }, replaced)).toBe(false);
		expect(isDefaultBackend({ ...lan, url: "http://10.0.0.2" }, replaced)).toBe(
			false,
		);
	});
});

describe("seen backends", () => {
	it("records the first sighting once and counts distinct accounts", () => {
		const first = recordCustomSignIn(db, "https://b.example", "custom-a", 1);
		const again = recordCustomSignIn(db, "https://b.example", "custom-a", 2);
		const other = recordCustomSignIn(db, "https://b.example", "custom-b", 3);
		expect(first.firstSeen).toBe(true);
		expect(again).toEqual({ id: first.id, firstSeen: false });
		expect(other.firstSeen).toBe(false);
		expect(listSeenBackends(db)).toEqual([
			{
				id: first.id,
				url: "https://b.example",
				firstSeenAt: 1,
				lastSeenAt: 3,
				accountCount: 2,
				banned: false,
				bannedAt: null,
				bannedBy: null,
			},
		]);
	});

	it("stores a hostile-looking URL as data, never as SQL", () => {
		const url = "https://b.example/'); DROP TABLE sessions; --";
		recordCustomSignIn(db, url, "custom-a");
		expect(listSeenBackends(db)[0]?.url).toBe(url);
		expect(db.query("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({
			n: 0,
		});
	});

	it("bans and unbans by id", () => {
		const { id } = recordCustomSignIn(db, "https://b.example", "custom-a");
		expect(setBackendBanned(db, id, { banned: true, by: "boss@x.co" }, 5)).toBe(
			"https://b.example",
		);
		expect(isBannedBackend(db, "https://b.example")).toBe(true);
		expect(listSeenBackends(db)[0]).toMatchObject({
			banned: true,
			bannedAt: 5,
			bannedBy: "boss@x.co",
		});
		setBackendBanned(db, id, { banned: false, by: "boss@x.co" });
		expect(isBannedBackend(db, "https://b.example")).toBe(false);
		expect(
			setBackendBanned(db, "missing", { banned: true, by: "x" }),
		).toBeNull();
		expect(isBannedBackend(db, "https://never.example")).toBe(false);
	});

	it("hands the tab the policy and the list in one object", async () => {
		setCustomBackendsAllowed(db, true);
		recordCustomSignIn(db, "https://b.example", "custom-a");
		await expect(pullBackendRequests(db)).resolves.toMatchObject({
			customAllowed: true,
			defaultUrl: "",
			defaultKey: "",
			seen: [{ url: "https://b.example" }],
		});
	});
});

describe("testBackend", () => {
	it("asks the auth settings endpoint with the key", async () => {
		const fetch = vi.fn(async () => new Response("{}"));
		expect(
			await testBackend(
				{ url: "http://192.168.1.10", publishableKey: "anon" },
				fetch as unknown as typeof globalThis.fetch,
			),
		).toBe(true);
		expect(fetch).toHaveBeenCalledWith("http://192.168.1.10/auth/v1/settings", {
			headers: { apikey: "anon" },
		});
	});

	it("is false on an error status or a failure, never a throw", async () => {
		const status = vi.fn(async () => new Response("", { status: 401 }));
		const failure = vi.fn(async () => {
			throw new Error("refused");
		});
		const backend = { url: "http://x.example", publishableKey: "k" };
		expect(await testBackend(backend, status as never)).toBe(false);
		expect(await testBackend(backend, failure as never)).toBe(false);
	});
});
