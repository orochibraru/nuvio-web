import { describe, expect, it } from "vitest";
import type {
	LibraryDeltaEvent,
	WatchedItemDeltaEvent,
	WatchProgressDeltaEvent,
} from "#lib/nuvio/index.js";
import {
	buildFlushPayload,
	overlayPendingLibrary,
	overlayPendingProgress,
	pendingLibraryWrites,
	pendingProgressWrites,
	pruneStale,
	reconcileHistory,
	reconcileLibrary,
	reconcileProgress,
	sameTarget,
	splitPendingWrites,
} from "./reconcile.ts";
import type { PendingWrite, ProgressRecord } from "./types.ts";

function libEvent(
	over: Partial<LibraryDeltaEvent> & Pick<LibraryDeltaEvent, "event_id">,
): LibraryDeltaEvent {
	return {
		operation: "upsert",
		content_id: "tt1",
		content_type: "movie",
		name: "One",
		poster: null,
		poster_shape: "POSTER",
		background: null,
		description: null,
		release_info: null,
		imdb_rating: null,
		genres: [],
		addon_base_url: null,
		added_at: 1000,
		...over,
	};
}

function progEvent(
	over: Partial<WatchProgressDeltaEvent> &
		Pick<WatchProgressDeltaEvent, "event_id">,
): WatchProgressDeltaEvent {
	return {
		operation: "upsert",
		progress_key: "tt1",
		content_id: "tt1",
		content_type: "movie",
		video_id: "tt1",
		season: null,
		episode: null,
		position: 0,
		duration: 0,
		last_watched: 1000,
		...over,
	};
}

function histEvent(
	over: Partial<WatchedItemDeltaEvent> &
		Pick<WatchedItemDeltaEvent, "event_id">,
): WatchedItemDeltaEvent {
	return {
		operation: "upsert",
		content_id: "tt1",
		content_type: "movie",
		title: "One",
		season: null,
		episode: null,
		watched_at: 1000,
		...over,
	};
}

describe("reconcileLibrary", () => {
	it("applies upserts and tracks the cursor", () => {
		const { records, cursor } = reconcileLibrary(new Map(), [
			libEvent({ event_id: 5, content_id: "tt1", name: "One" }),
			libEvent({ event_id: 9, content_id: "tt2", name: "Two" }),
		]);
		expect(cursor).toBe(9);
		expect([...records.keys()]).toEqual(["movie:tt1", "movie:tt2"]);
		expect(records.get("movie:tt1")?.name).toBe("One");
	});

	it("applies events in event_id order regardless of array order", () => {
		const { records } = reconcileLibrary(new Map(), [
			libEvent({ event_id: 20, content_id: "tt1", operation: "delete" }),
			libEvent({ event_id: 10, content_id: "tt1", name: "Early" }),
		]);
		expect(records.has("movie:tt1")).toBe(false);
	});

	it("last write wins for the same identity", () => {
		const { records } = reconcileLibrary(new Map(), [
			libEvent({ event_id: 1, content_id: "tt1", name: "Old" }),
			libEvent({ event_id: 2, content_id: "tt1", name: "New" }),
		]);
		expect(records.get("movie:tt1")?.name).toBe("New");
	});

	it("deletes remove the identity", () => {
		const seed = reconcileLibrary(new Map(), [
			libEvent({ event_id: 1, content_id: "tt1" }),
		]).records;
		const { records, cursor } = reconcileLibrary(
			seed,
			[libEvent({ event_id: 4, content_id: "tt1", operation: "delete" })],
			1,
		);
		expect(records.size).toBe(0);
		expect(cursor).toBe(4);
	});

	it("keeps the base cursor when the batch is empty", () => {
		const { cursor } = reconcileLibrary(new Map(), [], 42);
		expect(cursor).toBe(42);
	});

	it("never lowers the cursor below the base", () => {
		const { cursor } = reconcileLibrary(
			new Map(),
			[libEvent({ event_id: 3 })],
			99,
		);
		expect(cursor).toBe(99);
	});

	it("distinguishes movie and series with the same id", () => {
		const { records } = reconcileLibrary(new Map(), [
			libEvent({ event_id: 1, content_id: "tt1", content_type: "movie" }),
			libEvent({ event_id: 2, content_id: "tt1", content_type: "series" }),
		]);
		expect(records.size).toBe(2);
		expect([...records.keys()]).toEqual(["movie:tt1", "series:tt1"]);
	});
});

describe("reconcileProgress", () => {
	it("keys by progress_key and carries season/episode", () => {
		const { records } = reconcileProgress(new Map(), [
			progEvent({
				event_id: 1,
				progress_key: "tt9_s1e2",
				video_id: "tt9:1:2",
				season: 1,
				episode: 2,
				position: 500,
				duration: 1000,
			}),
		]);
		const row = records.get("tt9_s1e2");
		expect(row?.season).toBe(1);
		expect(row?.episode).toBe(2);
		expect(row?.position).toBe(500);
	});

	it("later position for the same key overwrites", () => {
		const { records } = reconcileProgress(new Map(), [
			progEvent({ event_id: 1, position: 100, last_watched: 1 }),
			progEvent({ event_id: 2, position: 900, last_watched: 2 }),
		]);
		expect(records.get("tt1")?.position).toBe(900);
	});
});

describe("reconcileHistory", () => {
	it("keys by content/season/episode", () => {
		const { records } = reconcileHistory(new Map(), [
			histEvent({ event_id: 1, content_id: "tt5", season: 2, episode: 3 }),
			histEvent({
				event_id: 2,
				content_id: "tt5",
				season: null,
				episode: null,
			}),
		]);
		expect([...records.keys()]).toEqual(["tt5:2:3", "tt5::"]);
	});

	it("delete removes a specific episode row", () => {
		const seed = reconcileHistory(new Map(), [
			histEvent({ event_id: 1, content_id: "tt5", season: 1, episode: 1 }),
			histEvent({ event_id: 2, content_id: "tt5", season: 1, episode: 2 }),
		]).records;
		const { records } = reconcileHistory(
			seed,
			[
				histEvent({
					event_id: 6,
					content_id: "tt5",
					season: 1,
					episode: 1,
					operation: "delete",
				}),
			],
			2,
		);
		expect([...records.keys()]).toEqual(["tt5:1:2"]);
	});
});

describe("overlayPendingLibrary", () => {
	it("re-adds an item a stale pull dropped", () => {
		const record = {
			contentId: "tt1",
			contentType: "movie" as const,
			name: "One",
			poster: null,
			background: null,
			description: null,
			releaseInfo: null,
			imdbRating: null,
			genres: [],
			addedAt: 1,
		};
		const result = overlayPendingLibrary(new Map(), [
			{ kind: "library.upsert", record },
		]);
		expect(result.get("movie:tt1")).toBe(record);
	});

	it("keeps an item removed that a stale pull still had", () => {
		const record = {
			contentId: "tt1",
			contentType: "movie" as const,
			name: "One",
			poster: null,
			background: null,
			description: null,
			releaseInfo: null,
			imdbRating: null,
			genres: [],
			addedAt: 1,
		};
		const result = overlayPendingLibrary(new Map([["movie:tt1", record]]), [
			{ kind: "library.delete", contentType: "movie", contentId: "tt1" },
		]);
		expect(result.has("movie:tt1")).toBe(false);
	});
});

describe("overlayPendingProgress", () => {
	const base: ProgressRecord = {
		progressKey: "tt1",
		contentId: "tt1",
		contentType: "movie",
		videoId: "tt1",
		season: null,
		episode: null,
		position: 100,
		duration: 1000,
		lastWatched: 100,
	};

	it("keeps the more recently watched row", () => {
		const server = new Map([
			["tt1", { ...base, position: 100, lastWatched: 100 }],
		]);
		const result = overlayPendingProgress(server, [
			{ ...base, position: 800, lastWatched: 500 },
		]);
		expect(result.get("tt1")?.position).toBe(800);
	});

	it("does not clobber a newer server row with a stale local one", () => {
		const server = new Map([
			["tt1", { ...base, position: 950, lastWatched: 900 }],
		]);
		const result = overlayPendingProgress(server, [
			{ ...base, position: 200, lastWatched: 300 },
		]);
		expect(result.get("tt1")?.position).toBe(950);
	});
});

describe("realistic sync sequence", () => {
	it("pull that lands before our push does not revert an optimistic add", () => {
		// Snapshot had the title; we removed it locally and queued the delete.
		const afterSnapshot = new Map([
			[
				"movie:tt1",
				{
					contentId: "tt1",
					contentType: "movie" as const,
					name: "One",
					poster: null,
					background: null,
					description: null,
					releaseInfo: null,
					imdbRating: null,
					genres: [],
					addedAt: 1,
				},
			],
		]);
		// A background delta pull runs before the delete is acknowledged: still has it.
		const { records } = reconcileLibrary(afterSnapshot, [
			libEvent({ event_id: 3, content_id: "tt1", name: "One" }),
		]);
		// Overlay the still-pending delete.
		const settled = overlayPendingLibrary(records, [
			{ kind: "library.delete", contentType: "movie", contentId: "tt1" },
		]);
		expect(settled.has("movie:tt1")).toBe(false);
	});

	it("advancing cursor across successive delta batches", () => {
		let state = reconcileLibrary(new Map(), [
			libEvent({ event_id: 2, content_id: "a" }),
			libEvent({ event_id: 5, content_id: "b" }),
		]);
		expect(state.cursor).toBe(5);
		state = reconcileLibrary(
			state.records,
			[libEvent({ event_id: 8, content_id: "a", operation: "delete" })],
			state.cursor,
		);
		expect(state.cursor).toBe(8);
		expect([...state.records.keys()]).toEqual(["movie:b"]);
	});
});

describe("pruneStale", () => {
	it("drops entries older than the grace window, keeps the rest", () => {
		const now = 10_000;
		const entries = [{ at: now - 20_000 }, { at: now - 1000 }, { at: now }];
		expect(pruneStale(entries, 15_000, now)).toEqual([
			{ at: now - 1000 },
			{ at: now },
		]);
	});

	it("keeps an entry exactly at the cutoff boundary out", () => {
		const now = 10_000;
		expect(pruneStale([{ at: now - 15_000 }], 15_000, now)).toEqual([]);
	});
});

describe("sameTarget", () => {
	const upsert = (contentId: string): PendingWrite => ({
		kind: "library.upsert",
		queuedAt: 0,
		record: {
			contentId,
			contentType: "movie",
			name: contentId,
			poster: null,
			background: null,
			description: null,
			releaseInfo: null,
			imdbRating: null,
			genres: [],
			addedAt: 0,
		},
	});
	const del = (contentId: string): PendingWrite => ({
		kind: "library.delete",
		contentType: "movie",
		contentId,
		queuedAt: 0,
	});

	it("matches an upsert and a delete for the same library item", () => {
		expect(sameTarget(upsert("tt1"), del("tt1"))).toBe(true);
	});

	it("does not match different content ids", () => {
		expect(sameTarget(upsert("tt1"), del("tt2"))).toBe(false);
	});

	it("does not match writes of unrelated kinds", () => {
		const progress: PendingWrite = {
			kind: "progress.delete",
			progressKey: "tt1",
			queuedAt: 0,
		};
		expect(sameTarget(upsert("tt1"), progress)).toBe(false);
	});
});

describe("splitPendingWrites", () => {
	const write = (contentId: string): PendingWrite => ({
		kind: "library.delete",
		contentType: "movie",
		contentId,
		queuedAt: 0,
	});

	it("prunes stale recently-flushed entries and merges the rest with the queue, oldest first", () => {
		const now = 10_000;
		const recentlyFlushed = [
			{ write: write("stale"), at: now - 20_000 },
			{ write: write("fresh"), at: now - 1000 },
		];
		const { pruned, pending } = splitPendingWrites(
			[write("queued")],
			recentlyFlushed,
			15_000,
			now,
		);
		expect(pruned).toEqual([{ write: write("fresh"), at: now - 1000 }]);
		expect(pending).toEqual([write("fresh"), write("queued")]);
	});

	it("returns just the queue when nothing was recently flushed", () => {
		const { pruned, pending } = splitPendingWrites(
			[write("queued")],
			[],
			15_000,
		);
		expect(pruned).toEqual([]);
		expect(pending).toEqual([write("queued")]);
	});
});

describe("pendingLibraryWrites", () => {
	it("keeps only library upserts and deletes, dropping other write kinds", () => {
		const record = {
			contentId: "tt1",
			contentType: "movie" as const,
			name: "One",
			poster: null,
			background: null,
			description: null,
			releaseInfo: null,
			imdbRating: null,
			genres: [],
			addedAt: 1,
		};
		const writes: PendingWrite[] = [
			{ kind: "progress.delete", progressKey: "x", queuedAt: 0 },
			{ kind: "library.upsert", record, queuedAt: 0 },
			{
				kind: "library.delete",
				contentType: "series",
				contentId: "tt2",
				queuedAt: 0,
			},
		];
		expect(pendingLibraryWrites(writes)).toEqual([
			{ kind: "library.upsert", record },
			{ kind: "library.delete", contentType: "series", contentId: "tt2" },
		]);
	});
});

describe("pendingProgressWrites", () => {
	it("extracts only progress.push records, in order", () => {
		const record: ProgressRecord = {
			progressKey: "tt1",
			contentId: "tt1",
			contentType: "movie",
			videoId: "tt1",
			season: null,
			episode: null,
			position: 1,
			duration: 2,
			lastWatched: 3,
		};
		const writes: PendingWrite[] = [
			{ kind: "progress.push", record, queuedAt: 0 },
			{ kind: "progress.delete", progressKey: "tt2", queuedAt: 0 },
		];
		expect(pendingProgressWrites(writes)).toEqual([record]);
	});
});

describe("buildFlushPayload", () => {
	it("shapes every write kind into the flush command's request shape", () => {
		const batch: PendingWrite[] = [
			{
				kind: "library.upsert",
				queuedAt: 0,
				record: {
					contentId: "tt1",
					contentType: "movie",
					name: "One",
					poster: null,
					background: null,
					description: null,
					releaseInfo: null,
					imdbRating: null,
					genres: [],
					addedAt: 5,
				},
			},
			{
				kind: "library.delete",
				contentType: "series",
				contentId: "tt2",
				queuedAt: 0,
			},
			{
				kind: "progress.push",
				queuedAt: 0,
				record: {
					progressKey: "tt3",
					contentId: "tt3",
					contentType: "movie",
					videoId: "tt3",
					season: 1,
					episode: 2,
					position: 10,
					duration: 100,
					lastWatched: 20,
				},
			},
			{ kind: "progress.delete", progressKey: "tt4", queuedAt: 0 },
			{
				kind: "history.delete",
				queuedAt: 0,
				record: {
					id: "tt5::",
					contentId: "tt5",
					contentType: "movie",
					title: "Five",
					season: null,
					episode: null,
					watchedAt: 1,
				},
			},
		];

		const payload = buildFlushPayload(batch);

		expect(payload.libraryUpserts).toEqual([
			{
				content_id: "tt1",
				content_type: "movie",
				name: "One",
				poster: undefined,
				background: undefined,
				description: undefined,
				release_info: undefined,
				imdb_rating: undefined,
				genres: [],
				added_at: 5,
			},
		]);
		expect(payload.libraryDeletes).toEqual([
			{ content_id: "tt2", content_type: "series" },
		]);
		expect(payload.progressPushes).toEqual([
			{
				content_id: "tt3",
				content_type: "movie",
				video_id: "tt3",
				season: 1,
				episode: 2,
				position: 10,
				duration: 100,
				last_watched: 20,
			},
		]);
		expect(payload.progressDeletes).toEqual(["tt4"]);
		expect(payload.historyDeletes).toEqual([
			{ content_id: "tt5", season: undefined, episode: undefined },
		]);
	});
});
