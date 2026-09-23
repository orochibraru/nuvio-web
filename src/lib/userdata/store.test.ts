import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryRecord, ProgressRecord } from "#lib/sync/types.js";
import { UserDataEvents } from "./events.ts";
import type { RemoteChange } from "./merge.ts";
import { UserDataStore } from "./store.ts";
import type { StoredRow } from "./types.ts";

const U = "user-1";

function film(id: string, addedAt = 100): LibraryRecord {
	return {
		contentId: id,
		contentType: "movie",
		name: id,
		poster: null,
		background: null,
		description: null,
		releaseInfo: null,
		imdbRating: null,
		genres: [],
		addedAt,
	};
}

function progress(key: string, lastWatched: number): ProgressRecord {
	return {
		progressKey: key,
		contentId: key,
		contentType: "movie",
		videoId: key,
		season: null,
		episode: null,
		position: 10,
		duration: 100,
		lastWatched,
	};
}

function write(id: string, at = 100, deleted = false): StoredRow {
	return {
		entity: "library",
		key: `movie:${id}`,
		record: film(id, at),
		deleted,
		at,
	};
}

function remote(id: string, at: number, eventId = 1, deleted = false) {
	return { ...write(id, at, deleted), eventId } satisfies RemoteChange;
}

let now: number;
let events: UserDataEvents;
let store: UserDataStore;

beforeEach(() => {
	now = 10_000;
	const db = new Database(":memory:");
	events = new UserDataEvents();
	store = new UserDataStore({ connect: () => db }, events, () => now);
});

describe("reads", () => {
	it("an unknown profile is empty with zero cursors", () => {
		expect(store.profile(U, 1)).toBeNull();
		expect(store.snapshot(U, 1)).toEqual({
			cursors: { library: 0, watchProgress: 0, watchHistory: 0 },
			library: [],
			progress: [],
			history: [],
		});
	});

	it("lists live rows newest first, per user and profile", () => {
		store.applyWrites(U, 1, [write("old", 1), write("new", 2)]);
		store.applyWrites(U, 1, [write("gone", 3, true)]);
		store.applyWrites(U, 2, [write("other-profile")]);
		store.applyWrites("user-2", 1, [write("other-user")]);

		expect(store.list(U, 1, "library").map((item) => item.contentId)).toEqual([
			"new",
			"old",
		]);
		expect(store.snapshot(U, 1).cursors.library).toBe(3);
	});

	it("sorts progress and history by their own clocks", () => {
		store.applyWrites(U, 1, [
			{
				entity: "progress",
				key: "a",
				record: progress("a", 5),
				deleted: false,
				at: 5,
			},
			{
				entity: "progress",
				key: "b",
				record: progress("b", 9),
				deleted: false,
				at: 9,
			},
		]);
		store.applyRemote(U, 1, [
			{
				entity: "history",
				key: "h1",
				record: {
					id: "h1",
					contentId: "tt1",
					contentType: "movie",
					title: "One",
					season: null,
					episode: null,
					watchedAt: 1,
				},
				deleted: false,
				at: 1,
				eventId: 1,
			},
		]);
		expect(store.list(U, 1, "progress").map((row) => row.progressKey)).toEqual([
			"b",
			"a",
		]);
		expect(store.list(U, 1, "history")).toHaveLength(1);
	});
});

describe("deltas", () => {
	it("returns rows past the cursor, deletes as null, and the new cursors", () => {
		store.applyWrites(U, 1, [write("a"), write("b")]);
		store.applyWrites(U, 1, [write("a", 200, true)]);

		const all = store.deltas(U, 1, {
			library: 0,
			watchProgress: 0,
			watchHistory: 0,
		});
		expect(all.changes).toEqual({
			library: { "movie:a": null, "movie:b": film("b") },
		});
		expect(all.cursors).toEqual({
			library: 3,
			watchProgress: 3,
			watchHistory: 3,
		});

		expect(store.deltas(U, 1, all.cursors).changes).toEqual({});
	});

	it("pages at the limit, resuming after the last row it returned", () => {
		store.applyWrites(U, 1, [write("a"), write("b"), write("c")]);
		const first = store.deltas(
			U,
			1,
			{ library: 0, watchProgress: 0, watchHistory: 0 },
			2,
		);
		expect(Object.keys(first.changes.library ?? {})).toEqual([
			"movie:a",
			"movie:b",
		]);
		expect(first.cursors.library).toBe(2);
		const rest = store.deltas(U, 1, first.cursors, 2);
		expect(Object.keys(rest.changes.library ?? {})).toEqual(["movie:c"]);
	});
});

describe("applyWrites", () => {
	it("stores, queues for Nuvio, and emits", () => {
		const listener = vi.fn();
		events.subscribe(U, 1, listener);

		const change = store.applyWrites(U, 1, [write("a")]);

		expect(change.changes).toEqual({ library: { "movie:a": film("a") } });
		expect(listener).toHaveBeenCalledWith(change);
		expect(store.dueOutbox(U, 1).map((entry) => entry.key)).toEqual([
			"movie:a",
		]);
	});

	it("keeps the replaced row's fields in a tombstone", () => {
		store.applyWrites(U, 1, [
			{ ...write("a"), record: { ...film("a"), name: "Full name" } },
		]);
		store.applyWrites(U, 1, [
			{ ...write("a", 200, true), record: film("stub") },
		]);
		const [entry] = store.dueOutbox(U, 1);
		expect(entry).toMatchObject({ deleted: true });
		expect((entry.record as LibraryRecord).name).toBe("Full name");
	});

	it("a stale write loses, but the row is re-sent so its client corrects", () => {
		store.applyWrites(U, 1, [write("a", 500)]);
		const change = store.applyWrites(U, 1, [write("a", 100, true)]);

		expect(change.changes).toEqual({ library: { "movie:a": film("a", 500) } });
		expect(store.list(U, 1, "library")).toHaveLength(1);
		expect(
			store.deltas(U, 1, { library: 1, watchProgress: 1, watchHistory: 1 })
				.changes,
		).toEqual({ library: { "movie:a": film("a", 500) } });
	});

	it("says which cursors the change follows on from", () => {
		store.applyWrites(U, 1, [write("a")]);
		const change = store.applyWrites(U, 1, [write("b"), write("c")]);
		expect(change.since).toEqual({
			library: 1,
			watchProgress: 1,
			watchHistory: 1,
		});
		expect(change.cursors.library).toBe(3);
	});

	it("emits nothing for an empty batch", () => {
		const listener = vi.fn();
		events.subscribe(U, 1, listener);
		store.applyWrites(U, 1, []);
		expect(listener).not.toHaveBeenCalled();
	});
});

describe("applyRemote", () => {
	it("merges Nuvio's changes and records its cursors", () => {
		const change = store.applyRemote(U, 1, [remote("a", 100)], {
			cursors: { library: 7 },
		});
		expect(change.changes).toEqual({ library: { "movie:a": film("a") } });
		expect(store.profile(U, 1)?.nuvioCursors).toEqual({
			library: 7,
			progress: 0,
			history: 0,
		});
		// Pulled rows are Nuvio's already: nothing to push back.
		expect(store.dueOutbox(U, 1)).toEqual([]);

		// A cursor never goes backwards.
		store.applyRemote(U, 1, [], { cursors: { library: 3 } });
		expect(store.profile(U, 1)?.nuvioCursors.library).toBe(7);
	});

	it("skips an echo of our own push", () => {
		store.applyWrites(U, 1, [write("a")]);
		const change = store.applyRemote(U, 1, [remote("a", 100)]);
		expect(change.changes).toEqual({});
	});

	it("a newer remote write wins and drops our pending push", () => {
		store.applyWrites(U, 1, [write("a", 100)]);
		store.applyRemote(U, 1, [remote("a", 200)]);
		expect(store.list(U, 1, "library")[0].addedAt).toBe(200);
		expect(store.dueOutbox(U, 1)).toEqual([]);
	});

	it("an older remote write loses and queues ours to go back", () => {
		store.applyRemote(U, 1, [remote("a", 300)]);
		store.applyWrites(U, 1, [write("a", 400, true)]);
		store.settleOutbox(U, 1, store.dueOutbox(U, 1), { ok: true });

		store.applyRemote(U, 1, [remote("a", 200, 2)]);
		expect(store.list(U, 1, "library")).toEqual([]);
		expect(store.dueOutbox(U, 1).map((entry) => entry.deleted)).toEqual([true]);
	});

	it("a remote delete never removes a write still waiting to be pushed", () => {
		store.applyWrites(U, 1, [write("a")]);
		store.applyRemote(U, 1, [remote("a", 0, 1, true)]);
		expect(store.list(U, 1, "library")).toHaveLength(1);

		store.settleOutbox(U, 1, store.dueOutbox(U, 1), { ok: true });
		store.applyRemote(U, 1, [remote("a", 0, 2, true)]);
		expect(store.list(U, 1, "library")).toEqual([]);
	});

	it("marks a profile imported", () => {
		expect(store.importedProfiles(U)).toEqual([]);
		store.applyWrites(U, 2, [write("a")]);
		store.applyRemote(U, 1, [], { imported: true });
		expect(store.importedProfiles(U)).toEqual([1]);
		expect(store.profile(U, 1)?.importedAt).toBe(now);
	});
});

describe("outbox", () => {
	it("backs a failed push off, and drops a successful one", () => {
		store.applyWrites(U, 1, [write("a")]);
		const [entry] = store.dueOutbox(U, 1);
		store.settleOutbox(U, 1, [entry], {
			ok: false,
			retryIn: (attempts) => attempts * 1000,
		});
		expect(store.dueOutbox(U, 1)).toEqual([]);

		now += 1000;
		const [retry] = store.dueOutbox(U, 1);
		expect(retry.attempts).toBe(1);
		store.settleOutbox(U, 1, [retry], { ok: true });
		now += 60_000;
		expect(store.dueOutbox(U, 1)).toEqual([]);
	});

	it("a row rewritten mid-push stays queued", () => {
		store.applyWrites(U, 1, [write("a", 100)]);
		const inFlight = store.dueOutbox(U, 1);
		store.applyWrites(U, 1, [write("a", 200)]);
		store.settleOutbox(U, 1, inFlight, { ok: true });
		expect(store.dueOutbox(U, 1).map((entry) => entry.at)).toEqual([200]);
	});
});

describe("clearProfile", () => {
	it("tombstones every live row, drops the outbox, and emits the deletes", () => {
		store.applyWrites(U, 1, [write("a"), write("b")]);
		store.applyWrites(U, 2, [write("other-profile")]);
		const listener = vi.fn();
		events.subscribe(U, 1, listener);
		now = 50_000;

		const change = store.clearProfile(U, 1);

		expect(change.changes).toEqual({
			library: { "movie:a": null, "movie:b": null },
		});
		expect(change.since.library).toBe(2);
		expect(change.cursors.library).toBe(4);
		expect(listener).toHaveBeenCalledWith(change);
		expect(store.list(U, 1, "library")).toEqual([]);
		expect(store.dueOutbox(U, 1)).toEqual([]);
		expect(store.list(U, 2, "library")).toHaveLength(1);
		expect(
			store.deltas(U, 1, { library: 2, watchProgress: 2, watchHistory: 2 })
				.changes,
		).toEqual({ library: { "movie:a": null, "movie:b": null } });
	});

	it("keeps the profile imported, and a stale Nuvio row can't come back", () => {
		store.applyRemote(U, 1, [remote("a", 100)], { imported: true });
		now = 50_000;
		store.clearProfile(U, 1);

		store.applyRemote(U, 1, [remote("a", 100, 2)]);

		expect(store.profile(U, 1)?.importedAt).not.toBeNull();
		expect(store.list(U, 1, "library")).toEqual([]);
	});

	it("emits nothing for an empty profile", () => {
		const listener = vi.fn();
		events.subscribe(U, 1, listener);
		store.clearProfile(U, 1);
		expect(listener).not.toHaveBeenCalled();
	});
});
