import { describe, expect, it } from "vitest";
import { fromBroadcastMessage, toBroadcastMessage } from "./broadcast.ts";
import type { HistoryRecord, LibraryRecord, ProgressRecord } from "./types.ts";
import { EMPTY_CURSORS } from "./types.ts";

const libRecord: LibraryRecord = {
	contentId: "tt1",
	contentType: "movie",
	name: "One",
	poster: null,
	background: null,
	description: null,
	releaseInfo: null,
	imdbRating: null,
	genres: [],
	addedAt: 1,
};

const progRecord: ProgressRecord = {
	progressKey: "tt1",
	contentId: "tt1",
	contentType: "movie",
	videoId: "tt1",
	season: null,
	episode: null,
	position: 10,
	duration: 100,
	lastWatched: 5,
};

const histRecord: HistoryRecord = {
	id: "tt5::",
	contentId: "tt5",
	contentType: "movie",
	title: "Five",
	season: null,
	episode: null,
	watchedAt: 1,
};

describe("toBroadcastMessage", () => {
	it("serializes the store's maps into arrays, carrying cursors/queue/bootstrapped as-is", () => {
		const message = toBroadcastMessage({
			library: new Map([["movie:tt1", libRecord]]),
			progress: new Map([["tt1", progRecord]]),
			history: new Map([["tt5::", histRecord]]),
			cursors: { ...EMPTY_CURSORS, library: 3 },
			queue: [],
			bootstrapped: true,
		});
		expect(message).toEqual({
			library: [libRecord],
			progress: [progRecord],
			history: [histRecord],
			cursors: { ...EMPTY_CURSORS, library: 3 },
			queue: [],
			bootstrapped: true,
		});
	});
});

describe("fromBroadcastMessage", () => {
	it("keys each record the same way the store does", () => {
		const { library, progress, history } = fromBroadcastMessage({
			library: [libRecord],
			progress: [progRecord],
			history: [histRecord],
			cursors: EMPTY_CURSORS,
			queue: [],
			bootstrapped: false,
		});
		expect(library.get("movie:tt1")).toBe(libRecord);
		expect(progress.get("tt1")).toBe(progRecord);
		expect(history.get("tt5::")).toBe(histRecord);
	});

	it("round-trips through toBroadcastMessage", () => {
		const sent = toBroadcastMessage({
			library: new Map([["movie:tt1", libRecord]]),
			progress: new Map([["tt1", progRecord]]),
			history: new Map([["tt5::", histRecord]]),
			cursors: EMPTY_CURSORS,
			queue: [],
			bootstrapped: true,
		});
		const received = fromBroadcastMessage(sent);
		expect([...received.library.entries()]).toEqual([["movie:tt1", libRecord]]);
		expect([...received.progress.entries()]).toEqual([["tt1", progRecord]]);
		expect([...received.history.entries()]).toEqual([["tt5::", histRecord]]);
	});
});
