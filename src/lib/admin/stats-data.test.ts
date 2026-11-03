import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "#lib/services/database.service.js";
import { UserDataEvents } from "#lib/userdata/events.js";
import { UserDataStore } from "#lib/userdata/store.js";
import {
	recordActive,
	recordSignIn,
	SIGN_IN_EVENT_RETENTION_DAYS,
} from "./admin-data.ts";
import {
	activePerDay,
	newAccountsPerDay,
	playsPerDay,
	signInsPerDay,
	statsOverview,
	topTitles,
	weeklyNewAndReturning,
} from "./stats-data.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-17T12:00:00Z");

let db: Database;

function createUserData(): void {
	new UserDataStore(
		{ connect: () => db },
		new UserDataEvents(),
	).importedProfiles("nobody");
}

let seq = 0;
function putRecord(
	userId: string,
	entity: "progress" | "history" | "library",
	record: Record<string, unknown>,
	at: number,
): void {
	seq++;
	db.run(
		`INSERT INTO userdata_records (user_id, profile_id, entity, key, record, deleted, updated_at, seq)
		VALUES (?, 1, ?, ?, ?, 0, ?, ?)`,
		[userId, entity, `k${seq}`, JSON.stringify(record), at, seq],
	);
}

function progress(contentId: string, position: number, duration: number) {
	return { contentId, contentType: "movie", position, duration };
}

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	seq = 0;
});

describe("signInsPerDay", () => {
	it("buckets sign-ins by UTC day, newest last, empty days included", () => {
		recordSignIn(db, "a@example.com", "u1", NOW - 2 * DAY);
		recordSignIn(db, "a@example.com", "u1", NOW);
		recordSignIn(db, "B@example.com", "u2", NOW + 1000);
		recordSignIn(db, "b@example.com", "u2", NOW + 2000);

		const days = signInsPerDay(db, 3, NOW + 2000);
		expect(days.map((day) => day.day)).toEqual([
			"2026-09-15",
			"2026-09-16",
			"2026-09-17",
		]);
		expect(days.map((day) => [day.value, day.people])).toEqual([
			[1, 1],
			[0, 0],
			[3, 2],
		]);
	});

	it("leaves out active events and events outside the window", () => {
		recordSignIn(db, "a@example.com", "u1", NOW - 10 * DAY);
		recordActive(db, "a@example.com", NOW);
		expect(signInsPerDay(db, 3, NOW).every((day) => day.value === 0)).toBe(
			true,
		);
	});

	it("prunes events past the retention window on write", () => {
		recordSignIn(db, "old@example.com", "u1", NOW);
		recordActive(db, "old@example.com", NOW);
		recordSignIn(
			db,
			"new@example.com",
			"u2",
			NOW + (SIGN_IN_EVENT_RETENTION_DAYS + 1) * DAY,
		);
		const count = db
			.query("SELECT COUNT(*) AS n FROM sign_in_events")
			.get() as {
			n: number;
		};
		expect(count.n).toBe(1);
	});
});

describe("activePerDay", () => {
	it("counts distinct people from sign-ins and active events", () => {
		recordSignIn(db, "a@example.com", "u1", NOW);
		recordActive(db, "a@example.com", NOW);
		recordActive(db, "b@example.com", NOW);
		recordActive(db, "b@example.com", NOW - DAY);
		expect(activePerDay(db, 2, NOW).map((day) => day.value)).toEqual([1, 2]);
	});
});

describe("statsOverview", () => {
	it("compares complete UTC days with the period before", () => {
		recordActive(db, "a@example.com", NOW - DAY);
		recordActive(db, "b@example.com", NOW - DAY);
		recordActive(db, "a@example.com", NOW - 2 * DAY);
		recordActive(db, "c@example.com", NOW - 10 * DAY);
		recordActive(db, "today@example.com", NOW);

		const stats = statsOverview(db, NOW);
		expect(stats.dailyActive).toEqual({ current: 2, previous: 1 });
		expect(stats.weeklyActive).toEqual({ current: 2, previous: 1 });
		expect(stats.monthlyActive).toEqual({ current: 3, previous: 0 });
	});

	it("counts new and total accounts from first sign-ins", () => {
		recordSignIn(db, "old@example.com", "u1", NOW - 40 * DAY);
		recordSignIn(db, "new@example.com", "u2", NOW - 3 * DAY);
		recordSignIn(db, "old@example.com", "u1", NOW - 2 * DAY);
		const stats = statsOverview(db, NOW);
		expect(stats.newAccounts).toEqual({ current: 1, previous: 1 });
		expect(stats.totalAccounts).toBe(2);
	});

	it("sums watch time from progress, capped at the duration", () => {
		createUserData();
		putRecord(
			"u1",
			"progress",
			progress("tt1", 3_600_000, 7_200_000),
			NOW - DAY,
		);
		putRecord(
			"u2",
			"progress",
			progress("tt2", 9_000_000, 5_400_000),
			NOW - 2 * DAY,
		);
		putRecord("u1", "progress", progress("tt3", 1_800_000, 0), NOW - 9 * DAY);
		putRecord("u1", "history", { contentId: "tt1", title: "One" }, NOW - DAY);

		const stats = statsOverview(db, NOW);
		expect(stats.plays).toEqual({ current: 2, previous: 1 });
		expect(stats.hoursWatched).toEqual({ current: 2.5, previous: 0.5 });
	});

	it("answers with zeroes before any user data exists", () => {
		const stats = statsOverview(db, NOW);
		expect(stats.plays).toEqual({ current: 0, previous: 0 });
		expect(playsPerDay(db, 3, NOW).map((day) => day.value)).toEqual([0, 0, 0]);
		expect(topTitles(db, 7, 10, NOW)).toEqual([]);
	});
});

describe("newAccountsPerDay", () => {
	it("buckets first sign-ins by day", () => {
		recordSignIn(db, "a@example.com", "u1", NOW - DAY);
		recordSignIn(db, "a@example.com", "u1", NOW);
		recordSignIn(db, "b@example.com", "u2", NOW);
		expect(newAccountsPerDay(db, 2, NOW).map((day) => day.value)).toEqual([
			1, 1,
		]);
	});
});

describe("playsPerDay", () => {
	it("counts progress rows per day and the accounts behind them", () => {
		createUserData();
		putRecord("u1", "progress", progress("tt1", 1, 2), NOW);
		putRecord("u1", "progress", progress("tt2", 1, 2), NOW);
		putRecord("u2", "progress", progress("tt1", 1, 2), NOW);
		putRecord("u2", "history", { contentId: "tt1" }, NOW);
		expect(playsPerDay(db, 1, NOW)).toEqual([
			{ day: "2026-09-17", value: 3, people: 2 },
		]);
	});
});

describe("weeklyNewAndReturning", () => {
	it("splits each week's people by whether it was their first week", () => {
		recordSignIn(db, "old@example.com", "u1", NOW - 20 * DAY);
		recordSignIn(db, "new@example.com", "u2", NOW - DAY);
		recordActive(db, "old@example.com", NOW);
		recordActive(db, "new@example.com", NOW);

		const weeks = weeklyNewAndReturning(db, 4, NOW);
		expect(weeks).toHaveLength(4);
		expect(weeks.at(-1)).toMatchObject({ newPeople: 1, returningPeople: 1 });
		expect(weeks[1]).toMatchObject({ newPeople: 1, returningPeople: 0 });
	});
});

describe("topTitles", () => {
	it("ranks this week's titles by distinct accounts, named from the stored records", () => {
		createUserData();
		putRecord("u1", "progress", progress("tt1", 1, 2), NOW);
		putRecord("u2", "progress", progress("tt1", 1, 2), NOW);
		putRecord(
			"u2",
			"history",
			{ contentId: "tt1", contentType: "movie", title: "First" },
			NOW,
		);
		putRecord("u1", "progress", progress("tt2", 1, 2), NOW);
		putRecord(
			"u1",
			"library",
			{ contentId: "tt2", name: "Second" },
			NOW - 30 * DAY,
		);
		putRecord("u3", "progress", progress("tt3", 1, 2), NOW - 8 * DAY);
		putRecord(
			"u3",
			"progress",
			{ ...progress("tt4", 1, 2), contentType: "series" },
			NOW,
		);

		expect(topTitles(db, 7, 10, NOW)).toEqual([
			{
				contentId: "tt1",
				contentType: "movie",
				name: "First",
				accounts: 2,
				plays: 2,
			},
			{
				contentId: "tt2",
				contentType: "movie",
				name: "Second",
				accounts: 1,
				plays: 1,
			},
			{
				contentId: "tt4",
				contentType: "series",
				name: "tt4",
				accounts: 1,
				plays: 1,
			},
		]);
	});
});
