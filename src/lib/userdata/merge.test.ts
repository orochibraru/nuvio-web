import { describe, expect, it } from "vitest";
import type { LibraryRecord } from "#lib/sync/types.js";
import {
	backoffMs,
	decide,
	foldChanges,
	historyChanges,
	libraryChanges,
	localWrites,
	progressChanges,
	type RemoteChange,
	sameRecord,
	snapshotChanges,
} from "./merge.ts";
import type { StoredRow } from "./types.ts";

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

function row(over: Partial<StoredRow> = {}): StoredRow {
	return {
		entity: "library",
		key: "movie:tt1",
		record: film("tt1"),
		deleted: false,
		at: 100,
		...over,
	};
}

const libraryEvent = {
	event_id: 1,
	operation: "upsert" as const,
	content_id: "tt1",
	content_type: "movie" as const,
	name: "One",
	poster: null,
	poster_shape: "POSTER" as const,
	background: null,
	description: null,
	release_info: null,
	imdb_rating: null,
	genres: [],
	addon_base_url: null,
	added_at: 500,
};

describe("sameRecord", () => {
	it("compares field by field, whatever the key order", () => {
		expect(sameRecord({ a: 1, b: [1] }, { b: [1], a: 1 })).toBe(true);
		expect(sameRecord({ a: 1 }, { a: 2 })).toBe(false);
		expect(sameRecord({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});
});

describe("decide", () => {
	it("applies anything new", () => {
		expect(decide(undefined, row(), false)).toBe("apply");
	});

	it("skips an echo of what we already have", () => {
		expect(decide(row(), row({ at: 999 }), false)).toBe("skip");
	});

	it("last write wins on `at`", () => {
		const newer = row({ record: film("tt1", 200), at: 200 });
		expect(decide(row(), newer, false)).toBe("apply");
		expect(decide(newer, row(), false)).toBe("push");
		expect(decide(newer, row(), true)).toBe("push");
	});

	it("a tie goes to Nuvio, so a normalised echo settles instead of ping-ponging", () => {
		expect(decide(row(), row({ record: film("tt1", 100) }), false)).toBe(
			"skip",
		);
		const renamed = row({ record: { ...film("tt1"), name: "Renamed" } });
		expect(decide(row(), renamed, false)).toBe("apply");
	});

	it("resurrects a tombstone only with a newer write", () => {
		const tombstone = row({ deleted: true, at: 300 });
		expect(decide(tombstone, row({ at: 400 }), false)).toBe("apply");
		expect(decide(tombstone, row({ at: 200 }), false)).toBe("push");
	});

	it("a remote delete removes a pushed row but never an unpushed one", () => {
		const remoteDelete = row({ deleted: true, at: 1 });
		expect(decide(row(), remoteDelete, false)).toBe("apply");
		expect(decide(row(), remoteDelete, true)).toBe("push");
	});

	it("a delete of nothing, or of a tombstone, is nothing", () => {
		const remoteDelete = row({ deleted: true });
		expect(decide(undefined, remoteDelete, false)).toBe("skip");
		expect(decide(row({ deleted: true }), remoteDelete, true)).toBe("skip");
	});
});

describe("foldChanges", () => {
	it("keeps the highest event per row, whatever the arrival order", () => {
		const change = (eventId: number, key: string): RemoteChange => ({
			...row({ key }),
			eventId,
		});
		const folded = foldChanges([
			change(3, "a"),
			change(1, "a"),
			change(2, "b"),
		]);
		expect(folded.map((entry) => [entry.key, entry.eventId])).toEqual([
			["a", 3],
			["b", 2],
		]);
	});
});

describe("Nuvio events as changes", () => {
	it("dates an upsert by its own timestamp and a delete by the pull", () => {
		const [upsert, removal] = libraryChanges(
			[libraryEvent, { ...libraryEvent, event_id: 2, operation: "delete" }],
			9000,
		);
		expect(upsert).toMatchObject({
			entity: "library",
			key: "movie:tt1",
			deleted: false,
			at: 500,
			eventId: 1,
		});
		expect(removal).toMatchObject({ deleted: true, at: 9000, eventId: 2 });
	});

	it("keys progress by its progress key and history by content/season/episode", () => {
		const progressEvent = {
			event_id: 4,
			operation: "delete" as const,
			progress_key: "tt9_s1e2",
			content_id: "tt9",
			content_type: "series" as const,
			video_id: "tt9:1:2",
			season: 1,
			episode: 2,
			position: 10,
			duration: 20,
			last_watched: 30,
		};
		expect(progressChanges([progressEvent], 50)[0]).toMatchObject({
			key: "tt9_s1e2",
			deleted: true,
			at: 50,
		});
		expect(
			progressChanges([{ ...progressEvent, operation: "upsert" }], 50)[0].at,
		).toBe(30);

		const historyEvent = {
			event_id: 5,
			operation: "upsert" as const,
			content_id: "tt9",
			content_type: "series" as const,
			title: "Nine",
			season: 1,
			episode: 2,
			watched_at: 60,
		};
		expect(historyChanges([historyEvent], 70)[0]).toMatchObject({
			key: "tt9:1:2",
			at: 60,
		});
		expect(
			historyChanges([{ ...historyEvent, operation: "delete" }], 70)[0].at,
		).toBe(70);
	});

	it("turns a full pull into upserts", () => {
		const changes = snapshotChanges({
			library: [
				{ ...libraryEvent, id: "x", user_id: "u", profile_id: 1 },
			] as never,
			progress: [
				{
					progress_key: "tt2",
					content_id: "tt2",
					content_type: "movie",
					video_id: "tt2",
					season: null,
					episode: null,
					position: 1,
					duration: 2,
					last_watched: 3,
				},
			] as never,
			history: [
				{
					content_id: "tt3",
					content_type: "movie",
					title: "Three",
					season: null,
					episode: null,
					watched_at: 4,
				},
			] as never,
		});
		expect(
			changes.map((change) => [change.entity, change.key, change.at]),
		).toEqual([
			["library", "movie:tt1", 500],
			["progress", "tt2", 3],
			["history", "tt3::", 4],
		]);
		expect(changes.every((change) => !change.deleted)).toBe(true);
	});
});

describe("localWrites", () => {
	const empty = {
		libraryUpserts: [],
		libraryDeletes: [],
		progressPushes: [],
		progressDeletes: [],
		historyDeletes: [],
	};

	it("turns a flush batch into rows, upserts dated by their own clock", () => {
		const rows = localWrites(
			{
				...empty,
				libraryUpserts: [
					{ content_id: "tt1", content_type: "movie", added_at: 50 },
				],
				libraryDeletes: [{ content_id: "tt2", content_type: "series" }],
				progressPushes: [
					{
						content_id: "tt3",
						content_type: "series",
						video_id: "tt3:1:2",
						season: 1,
						episode: 2,
						position: 10.6,
						duration: 99.4,
						last_watched: 70,
					},
				],
				progressDeletes: ["tt4"],
				historyDeletes: [{ content_id: "tt5" }],
			},
			1000,
		);
		expect(
			rows.map((entry) => [entry.entity, entry.key, entry.deleted, entry.at]),
		).toEqual([
			["library", "movie:tt1", false, 50],
			["library", "series:tt2", true, 1000],
			["progress", "tt3_s1e2", false, 70],
			["progress", "tt4", true, 1000],
			["history", "tt5::", true, 1000],
		]);
		expect(rows[0].record).toMatchObject({ name: "tt1", genres: [] });
		expect(rows[2].record).toMatchObject({ position: 11, duration: 99 });
	});

	it("caps a timestamp from a client clock running ahead", () => {
		const [write] = localWrites(
			{
				...empty,
				libraryUpserts: [
					{ content_id: "tt1", content_type: "movie", added_at: 5000 },
				],
			},
			1000,
		);
		expect(write.at).toBe(1000);
	});
});

describe("backoffMs", () => {
	it("doubles from 30 s and stops at an hour", () => {
		expect(backoffMs(1)).toBe(30_000);
		expect(backoffMs(2)).toBe(60_000);
		expect(backoffMs(20)).toBe(3_600_000);
	});
});
