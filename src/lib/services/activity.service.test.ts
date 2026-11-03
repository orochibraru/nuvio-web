import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTracker } from "./activity.service.ts";
import { DatabaseService } from "./database.service.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-02T12:00:00Z");

let db: Database;
let now: number;
let tryConnect: ReturnType<typeof vi.fn<() => Database | null>>;

function activeRows() {
	return db
		.query(
			"SELECT email, at FROM sign_in_events WHERE kind = 'active' ORDER BY at",
		)
		.all();
}

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	now = NOW;
	tryConnect = vi.fn<() => Database | null>(() => db);
});

describe("ActivityTracker", () => {
	it("records one active row per person per UTC day", () => {
		const tracker = new ActivityTracker(
			{ tryConnect },
			{ error: vi.fn() },
			() => now,
		);
		tracker.seen("A@Example.com");
		tracker.seen("a@example.com");
		now += 1000;
		tracker.seen("a@example.com");
		expect(tryConnect).toHaveBeenCalledTimes(1);

		now += DAY;
		tracker.seen("a@example.com");
		expect(activeRows()).toEqual([
			{ email: "a@example.com", at: Date.parse("2026-11-02T00:00:00Z") },
			{ email: "a@example.com", at: Date.parse("2026-11-03T00:00:00Z") },
		]);
	});

	it("leans on the unique index after a restart", () => {
		new ActivityTracker({ tryConnect }, { error: vi.fn() }, () => now).seen(
			"a@example.com",
		);
		new ActivityTracker({ tryConnect }, { error: vi.fn() }, () => now).seen(
			"a@example.com",
		);
		expect(activeRows()).toHaveLength(1);
	});

	it("does nothing without a database", () => {
		const tracker = new ActivityTracker(
			{ tryConnect: () => null },
			{ error: vi.fn() },
			() => now,
		);
		expect(() => tracker.seen("a@example.com")).not.toThrow();
	});
});
