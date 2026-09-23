import { describe, expect, it } from "vitest";
import {
	buildFlushPayload,
	libraryHas,
	libraryProgressMap,
	overlayPendingLibrary,
	overlayPendingProgress,
	pendingLibraryWrites,
	pendingProgressWrites,
	pruneStale,
	sameTarget,
	splitPendingWrites,
} from "./reconcile.ts";
import type { LibraryRecord, PendingWrite, ProgressRecord } from "./types.ts";

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

function progressRow(over: Partial<ProgressRecord>): ProgressRecord {
	return {
		progressKey: "tt1",
		contentId: "tt1",
		contentType: "movie",
		videoId: "tt1",
		season: null,
		episode: null,
		position: 0,
		duration: 1000,
		lastWatched: 0,
		...over,
	};
}

describe("libraryProgressMap", () => {
	it("keys by content id and clamps to a fraction of the total duration", () => {
		const map = libraryProgressMap([
			progressRow({ contentId: "tt1", position: 500, duration: 1000 }),
		]);
		expect(map.tt1).toBe(0.5);
	});

	it("skips a row that hasn't really started or is essentially finished", () => {
		const map = libraryProgressMap([
			progressRow({ contentId: "barely", position: 1, duration: 1000 }),
			progressRow({ contentId: "done", position: 950, duration: 1000 }),
		]);
		expect(map.barely).toBeUndefined();
		expect(map.done).toBeUndefined();
	});

	it("skips a row with no duration to avoid dividing by zero", () => {
		const map = libraryProgressMap([
			progressRow({ contentId: "tt1", position: 10, duration: 0 }),
		]);
		expect(map.tt1).toBeUndefined();
	});

	it("keeps the furthest fraction across multiple episodes of one title", () => {
		const map = libraryProgressMap([
			progressRow({
				contentId: "tt1",
				videoId: "e1",
				position: 200,
				duration: 1000,
			}),
			progressRow({
				contentId: "tt1",
				videoId: "e2",
				position: 700,
				duration: 1000,
			}),
		]);
		expect(map.tt1).toBe(0.7);
	});
});

describe("libraryHas", () => {
	const record = (over: Partial<LibraryRecord>): LibraryRecord => ({
		contentId: "tt1",
		contentType: "movie",
		name: "One",
		poster: null,
		background: null,
		description: null,
		releaseInfo: null,
		imdbRating: null,
		genres: [],
		addedAt: 0,
		...over,
	});

	it("matches on both content id and type", () => {
		const library = [record({ contentId: "tt1", contentType: "movie" })];
		expect(libraryHas(library, "movie", "tt1")).toBe(true);
		expect(libraryHas(library, "series", "tt1")).toBe(false);
		expect(libraryHas(library, "movie", "tt2")).toBe(false);
	});
});
