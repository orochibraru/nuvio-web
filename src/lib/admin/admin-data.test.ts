import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/env/private", () => ({ NUVIO_DATA_DIR: "data" }));

import { DatabaseService } from "#lib/services/database.service.js";
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
	SIGN_IN_EVENT_RETENTION_DAYS,
	setLocked,
	signInsPerDay,
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

describe("signInsPerDay", () => {
	const DAY = 86_400_000;
	// A fixed UTC midnight, so the buckets in these assertions are stable
	// wherever the suite runs.
	const NOW = Date.parse("2026-09-17T12:00:00Z");

	it("buckets events by UTC day, newest last", () => {
		recordSignIn(db, "a@example.com", "u1", NOW - 2 * DAY);
		recordSignIn(db, "a@example.com", "u1", NOW);
		recordSignIn(db, "b@example.com", "u2", NOW);

		const days = signInsPerDay(db, 3, NOW);

		expect(days.map((day) => day.day)).toEqual([
			"2026-09-15",
			"2026-09-16",
			"2026-09-17",
		]);
		expect(days.map((day) => day.signIns)).toEqual([1, 0, 2]);
	});

	// A chart built only from the days that have rows draws a quiet week as a
	// continuous line, which is the whole reason the zeroes are filled in.
	it("includes the days with no sign-ins at all", () => {
		const days = signInsPerDay(db, 5, NOW);
		expect(days).toHaveLength(5);
		expect(days.every((day) => day.signIns === 0)).toBe(true);
	});

	it("counts distinct people separately from sign-ins", () => {
		recordSignIn(db, "a@example.com", "u1", NOW);
		recordSignIn(db, "a@example.com", "u1", NOW + 1000);
		recordSignIn(db, "b@example.com", "u2", NOW + 2000);

		const today = signInsPerDay(db, 1, NOW + 2000).at(-1);
		expect(today).toMatchObject({ signIns: 3, people: 2 });
	});

	it("folds a repeat sign-in from one address into one person", () => {
		recordSignIn(db, "A@Example.com", "u1", NOW);
		recordSignIn(db, "a@example.com", "u1", NOW + 1000);
		expect(signInsPerDay(db, 1, NOW + 1000).at(-1)?.people).toBe(1);
	});

	it("leaves events outside the window out", () => {
		recordSignIn(db, "a@example.com", "u1", NOW - 10 * DAY);
		recordSignIn(db, "a@example.com", "u1", NOW);
		const days = signInsPerDay(db, 3, NOW);
		expect(days.reduce((sum, day) => sum + day.signIns, 0)).toBe(1);
	});

	it("prunes events past the retention window on write", () => {
		recordSignIn(db, "old@example.com", "u1", NOW);
		// A sign-in well past the retention window drops the old event.
		const later = NOW + (SIGN_IN_EVENT_RETENTION_DAYS + 1) * DAY;
		recordSignIn(db, "new@example.com", "u2", later);

		const count = db
			.query("SELECT COUNT(*) AS n FROM sign_in_events")
			.get() as { n: number };
		expect(count.n).toBe(1);
		// The per-person summary is untouched : it is not a log.
		expect(listSignIns(db)).toHaveLength(2);
	});
});
