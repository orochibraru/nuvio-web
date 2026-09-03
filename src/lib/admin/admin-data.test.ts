import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/env/private", () => ({ NUVIO_DATA_DIR: "data" }));

import { DatabaseService } from "#lib/services/index.js";
import {
	addToAllowlist,
	canSignIn,
	isLocked,
	isOnAllowlist,
	listAllowlist,
	listSignIns,
	normalizeEmail,
	recordSignIn,
	removeFromAllowlist,
	setLocked,
} from "./admin-data.ts";

let db: Database;

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
});

describe("sign-in log", () => {
	it("records one row per person and counts repeat sign-ins", () => {
		recordSignIn(db, "A@Example.com", "user-1", 1000);
		recordSignIn(db, "a@example.com", "user-1", 2000);

		expect(listSignIns(db)).toEqual([
			{
				email: "a@example.com",
				userId: "user-1",
				firstSeenAt: 1000,
				lastSeenAt: 2000,
				signInCount: 2,
			},
		]);
	});

	it("keeps the first-seen timestamp across later sign-ins", () => {
		recordSignIn(db, "a@example.com", "user-1", 1000);
		recordSignIn(db, "a@example.com", "user-1", 5000);
		expect(listSignIns(db)[0].firstSeenAt).toBe(1000);
	});

	it("orders the newest sign-in first", () => {
		recordSignIn(db, "old@example.com", "user-1", 1000);
		recordSignIn(db, "new@example.com", "user-2", 9000);
		expect(listSignIns(db).map((row) => row.email)).toEqual([
			"new@example.com",
			"old@example.com",
		]);
	});

	it("is empty before anyone signs in", () => {
		expect(listSignIns(db)).toEqual([]);
	});
});

describe("allowlist", () => {
	it("folds case on both write and read", () => {
		addToAllowlist(db, "  Person@Example.COM ", "admin@example.com", 1);
		expect(isOnAllowlist(db, "person@example.com")).toBe(true);
		expect(isOnAllowlist(db, "PERSON@EXAMPLE.COM")).toBe(true);
		expect(listAllowlist(db)).toEqual([
			{ email: "person@example.com", addedAt: 1, addedBy: "admin@example.com" },
		]);
	});

	it("adding twice does not duplicate or reset the entry", () => {
		addToAllowlist(db, "a@example.com", "admin@example.com", 1);
		addToAllowlist(db, "a@example.com", "someone@example.com", 999);
		expect(listAllowlist(db)).toEqual([
			{ email: "a@example.com", addedAt: 1, addedBy: "admin@example.com" },
		]);
	});

	it("removes an entry", () => {
		addToAllowlist(db, "a@example.com", "admin@example.com");
		removeFromAllowlist(db, "A@EXAMPLE.COM");
		expect(listAllowlist(db)).toEqual([]);
	});
});

describe("the lock", () => {
	it("is off until it is turned on", () => {
		expect(isLocked(db)).toBe(false);
		setLocked(db, true);
		expect(isLocked(db)).toBe(true);
		setLocked(db, false);
		expect(isLocked(db)).toBe(false);
	});

	it("lets everyone in while unlocked", () => {
		expect(canSignIn(db, "anyone@example.com", false)).toBe(true);
	});

	it("lets only the allowlist in once locked", () => {
		addToAllowlist(db, "invited@example.com", "admin@example.com");
		setLocked(db, true);

		expect(canSignIn(db, "invited@example.com", false)).toBe(true);
		expect(canSignIn(db, "INVITED@example.com", false)).toBe(true);
		expect(canSignIn(db, "stranger@example.com", false)).toBe(false);
	});

	// A typo'd allowlist must never lock the host out of the page that fixes it.
	it("always lets a server admin in, allowlisted or not", () => {
		setLocked(db, true);
		expect(canSignIn(db, "host@example.com", true)).toBe(true);
	});
});

describe("normalizeEmail", () => {
	it("trims and folds case", () => {
		expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com");
	});
});
