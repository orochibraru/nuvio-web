import { describe, expect, it } from "vitest";
import type {
	LibraryItem,
	WatchedItem,
	WatchProgress,
} from "#lib/nuvio/types.js";
import {
	contentType,
	historyKey,
	historyRecordFromItem,
	libraryKey,
	libraryRecordFromItem,
	progressKeyFor,
	progressRecordFromRow,
} from "./types.ts";

describe("contentType", () => {
	it("normalizes 'series' and treats anything else as a movie", () => {
		expect(contentType("series")).toBe("series");
		expect(contentType("movie")).toBe("movie");
		expect(contentType("channel")).toBe("movie");
	});
});

describe("libraryKey", () => {
	it("namespaces by content type so the same id can appear twice", () => {
		expect(libraryKey("movie", "tt1")).toBe("movie:tt1");
		expect(libraryKey("series", "tt1")).toBe("series:tt1");
		expect(libraryKey("movie", "tt1")).not.toBe(libraryKey("series", "tt1"));
	});
});

describe("historyKey", () => {
	it("includes season/episode when present", () => {
		expect(historyKey("tt5", 2, 3)).toBe("tt5:2:3");
	});

	it("collapses null season/episode to empty segments", () => {
		expect(historyKey("tt5", null, null)).toBe("tt5::");
	});
});

describe("progressKeyFor", () => {
	it("namespaces an episode row by season and episode", () => {
		expect(progressKeyFor("tt9", 1, 2)).toBe("tt9_s1e2");
	});

	it("falls back to the bare content id for a movie (no season/episode)", () => {
		expect(progressKeyFor("tt9", null, null)).toBe("tt9");
	});

	it("falls back to the bare content id when only one of season/episode is set", () => {
		expect(progressKeyFor("tt9", 1, null)).toBe("tt9");
		expect(progressKeyFor("tt9", null, 2)).toBe("tt9");
	});
});

// The snapshot (full-pull) mappers. Their delta siblings are covered above;
// these take the API's row shape instead of an event.

describe("libraryRecordFromItem", () => {
	const item = {
		content_id: "tt1",
		content_type: "series",
		name: "A",
		poster: "p",
		background: "b",
		description: "d",
		release_info: "2020",
		imdb_rating: 8.1,
		genres: ["Drama"],
		added_at: 1700,
	} as unknown as LibraryItem;

	it("maps a snapshot row to a local record", () => {
		expect(libraryRecordFromItem(item)).toEqual({
			contentId: "tt1",
			contentType: "series",
			name: "A",
			poster: "p",
			background: "b",
			description: "d",
			releaseInfo: "2020",
			imdbRating: 8.1,
			genres: ["Drama"],
			addedAt: 1700,
		});
	});

	it("defaults absent genres to an empty list", () => {
		expect(
			libraryRecordFromItem({ ...item, genres: null } as unknown as LibraryItem)
				.genres,
		).toEqual([]);
	});

	it("normalizes an unknown content type to a movie", () => {
		expect(
			libraryRecordFromItem({
				...item,
				content_type: "channel",
			} as unknown as LibraryItem).contentType,
		).toBe("movie");
	});
});

describe("progressRecordFromRow", () => {
	it("carries the server's progress key through", () => {
		expect(
			progressRecordFromRow({
				progress_key: "tt9_s1e2",
				content_id: "tt9",
				content_type: "series",
				video_id: "v1",
				season: 1,
				episode: 2,
				position: 120,
				duration: 2400,
				last_watched: 1700,
			} as unknown as WatchProgress),
		).toEqual({
			progressKey: "tt9_s1e2",
			contentId: "tt9",
			contentType: "series",
			videoId: "v1",
			season: 1,
			episode: 2,
			position: 120,
			duration: 2400,
			lastWatched: 1700,
		});
	});
});

describe("historyRecordFromItem", () => {
	it("derives the local id from content id + season + episode", () => {
		expect(
			historyRecordFromItem({
				content_id: "tt5",
				content_type: "series",
				title: "T",
				season: 2,
				episode: 3,
				watched_at: 1700,
			} as unknown as WatchedItem),
		).toEqual({
			id: "tt5:2:3",
			contentId: "tt5",
			contentType: "series",
			title: "T",
			season: 2,
			episode: 3,
			watchedAt: 1700,
		});
	});

	it("keeps a movie's empty season/episode segments", () => {
		expect(
			historyRecordFromItem({
				content_id: "tt5",
				content_type: "movie",
				title: "T",
				season: null,
				episode: null,
				watched_at: 1700,
			} as unknown as WatchedItem).id,
		).toBe("tt5::");
	});
});
