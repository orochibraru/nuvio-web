import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	LibraryDeltaEvent,
	LibraryItem,
	WatchedItemDeltaEvent,
	WatchProgressDeltaEvent,
} from "#lib/nuvio/types.js";

/**
 * The orchestration around `reconcile.ts`: the queue, the flush debounce, the
 * grace period, cursor handling, owner scoping and persistence. `reconcile.ts`
 * is covered as pure functions; this is the part that only broke in e2e before.
 *
 * Every test gets a fresh IndexedDB and a fresh module (the store is a
 * module-level singleton, and `idb.ts` caches its connection), with the three
 * remote functions replaced by fakes.
 */

vi.mock("$app/env", () => ({ browser: true, dev: false }));

const remote = vi.hoisted(() => ({
	syncSnapshot: vi.fn(),
	syncDeltas: vi.fn(),
	flushWrites: vi.fn(),
}));
vi.mock("./sync.remote.ts", () => remote);

type Store = typeof import("./store.svelte.ts").sync;

const USER_A = "user-a";
const USER_B = "user-b";

function libraryItem(id: string, addedAt = 1000): LibraryItem {
	return {
		content_id: id,
		content_type: "movie",
		name: `Title ${id}`,
		poster: null,
		background: null,
		description: null,
		release_info: null,
		imdb_rating: null,
		genres: [],
		added_at: addedAt,
	} as unknown as LibraryItem;
}

function snapshot(library: LibraryItem[] = [], cursor = 10) {
	return {
		cursors: { library: cursor, watchProgress: cursor, watchHistory: cursor },
		library,
		watchProgress: [],
		watchHistory: [],
	};
}

function libraryDelta(
	eventId: number,
	id: string,
	operation: "upsert" | "delete" = "upsert",
): LibraryDeltaEvent {
	return {
		event_id: eventId,
		operation,
		content_id: id,
		content_type: "movie",
		name: `Title ${id}`,
		poster: null,
		poster_shape: "POSTER",
		background: null,
		description: null,
		release_info: null,
		imdb_rating: null,
		genres: [],
		addon_base_url: null,
		added_at: 2000,
	} as LibraryDeltaEvent;
}

interface Deltas {
	library: LibraryDeltaEvent[];
	watchProgress: WatchProgressDeltaEvent[];
	watchHistory: WatchedItemDeltaEvent[];
}

const NO_DELTAS: Deltas = { library: [], watchProgress: [], watchHistory: [] };

let sync: Store;

// Every instance a test creates, so `afterEach` can detach them all: one left
// attached keeps its `visibilitychange` listener on the shared `document` and
// its timers, and answers for the next test.
const created: Store[] = [];

async function freshStore(): Promise<Store> {
	vi.resetModules();
	const store = (await import("./store.svelte.ts")).sync;
	created.push(store);
	return store;
}

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
	Object.assign(globalThis, { indexedDB: new IDBFactory() });
	remote.syncSnapshot.mockReset().mockResolvedValue(snapshot());
	remote.syncDeltas.mockReset().mockResolvedValue(NO_DELTAS);
	remote.flushWrites.mockReset().mockResolvedValue({ ok: true });
	sync = await freshStore();
});

afterEach(() => {
	for (const store of created.splice(0)) {
		store.detach();
	}
	vi.useRealTimers();
});

describe("attach", () => {
	it("is ready immediately but not authoritative until a snapshot lands", async () => {
		await sync.attach(1, USER_A);
		expect(sync.ready).toBe(true);
		expect(sync.authoritative).toBe(false);

		await sync.sync();
		expect(sync.synced).toBe(true);
		expect(sync.authoritative).toBe(true);
	});

	it("bootstraps from a full snapshot on the first sync, then pulls deltas", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")], 10));
		await sync.attach(1, USER_A);
		await sync.sync();

		expect(remote.syncSnapshot).toHaveBeenCalledTimes(1);
		expect(remote.syncDeltas).toHaveBeenCalledWith({
			library: 10,
			watchProgress: 10,
			watchHistory: 10,
		});
		expect(sync.library.map((record) => record.contentId)).toEqual(["tt1"]);
	});

	it("re-attaching the same owner is a no-op", async () => {
		await sync.attach(1, USER_A);
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
		});
		await sync.attach(1, USER_A);
		expect(sync.library).toHaveLength(1);
	});
});

describe("persistence and owner scoping", () => {
	it("restores the mirror from IndexedDB on the next attach, skipping the snapshot", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")]));
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.detach();

		// A new page load: new module, same IndexedDB.
		sync = await freshStore();
		await sync.attach(1, USER_A);
		expect(sync.library.map((record) => record.contentId)).toEqual(["tt1"]);
		expect(sync.synced).toBe(true);

		await sync.sync();
		expect(remote.syncSnapshot).toHaveBeenCalledTimes(1);
	});

	// The bug `syncOwner` exists for: profile *index* 1 in two accounts.
	it("never shows one account's mirror to another on the same profile index", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt-a")]));
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.detach();

		sync = await freshStore();
		await sync.attach(1, USER_B);
		expect(sync.library).toEqual([]);
		expect(sync.synced).toBe(false);

		// B must bootstrap from its own snapshot, not pull deltas from A's cursors.
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt-b")], 3));
		await sync.sync();
		expect(remote.syncSnapshot).toHaveBeenCalledTimes(2);
		expect(sync.library.map((record) => record.contentId)).toEqual(["tt-b"]);
	});

	it("does not flush another account's queued writes", async () => {
		await sync.attach(1, USER_A);
		sync.toggleLibrary({
			contentId: "tt-a",
			contentType: "movie",
			remove: false,
		});
		sync.detach();

		sync = await freshStore();
		await sync.attach(1, USER_B);
		await sync.flushNow();
		expect(remote.flushWrites).not.toHaveBeenCalled();
	});

	it("forget() wipes every account's mirror", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")]));
		await sync.attach(1, USER_A);
		await sync.sync();
		await sync.forget();
		expect(sync.ready).toBe(false);

		sync = await freshStore();
		await sync.attach(1, USER_A);
		expect(sync.library).toEqual([]);
		expect(sync.synced).toBe(false);
	});
});

describe("optimistic writes", () => {
	it("applies a library add locally and flushes it after the debounce", async () => {
		await sync.attach(1, USER_A);
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
			name: "One",
		});

		expect(sync.isInLibrary("movie", "tt1")).toBe(true);
		expect(sync.mutated).toBe(true);
		expect(remote.flushWrites).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1500);
		expect(remote.flushWrites).toHaveBeenCalledTimes(1);
		expect(remote.flushWrites.mock.calls[0][0].libraryUpserts).toEqual([
			expect.objectContaining({ content_id: "tt1", name: "One" }),
		]);
	});

	it("collapses rapid writes to one target into a single queued write", async () => {
		await sync.attach(1, USER_A);
		for (const position of [10, 20, 30, 40]) {
			sync.saveProgress({
				contentId: "tt1",
				contentType: "movie",
				videoId: "tt1",
				season: null,
				episode: null,
				position,
				duration: 100,
			});
		}
		await vi.advanceTimersByTimeAsync(1500);

		expect(remote.flushWrites).toHaveBeenCalledTimes(1);
		const pushes = remote.flushWrites.mock.calls[0][0].progressPushes;
		expect(pushes).toHaveLength(1);
		expect(pushes[0]).toMatchObject({ position: 40 });
	});

	it("ignores a progress save with no duration", async () => {
		await sync.attach(1, USER_A);
		sync.saveProgress({
			contentId: "tt1",
			contentType: "movie",
			videoId: "tt1",
			season: null,
			episode: null,
			position: 5,
			duration: 0,
		});
		expect(sync.progress).toEqual([]);
		expect(sync.mutated).toBe(false);
	});

	it("restoreHistory drops the queued delete it undoes", async () => {
		await sync.attach(1, USER_A);
		sync.deleteHistory({ contentId: "tt1", season: null, episode: null });

		sync.restoreHistory({
			id: "tt1::",
			contentId: "tt1",
			contentType: "movie",
			title: "One",
			season: null,
			episode: null,
			watchedAt: 1,
		});
		await sync.flushNow();
		expect(remote.flushWrites).not.toHaveBeenCalled();
		expect(sync.history.map((entry) => entry.id)).toEqual(["tt1::"]);
	});
});

describe("flush failures", () => {
	it("keeps the queue and reports stalled after two failures in a row", async () => {
		remote.flushWrites.mockRejectedValue(new Error("offline"));
		await sync.attach(1, USER_A);
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
		});

		await sync.flushNow();
		expect(sync.stalled).toBe(false);
		await sync.flushNow();
		expect(sync.stalled).toBe(true);

		remote.flushWrites.mockResolvedValue({ ok: true });
		await sync.flushNow();
		expect(sync.stalled).toBe(false);
		expect(remote.flushWrites).toHaveBeenCalledTimes(3);

		// Flushed, so a further flush has nothing to send.
		await sync.flushNow();
		expect(remote.flushWrites).toHaveBeenCalledTimes(3);
	});
});

describe("the lag grace period", () => {
	// A delta pull just after a flush can read a snapshot that predates the
	// write the server just accepted. Without the grace period, the pull would
	// revert what the user just did.
	it("keeps a just-flushed add over a stale pull that lacks it", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
		});
		await sync.flushNow();

		// The server's delta feed hasn't caught up: nothing new.
		await sync.sync();
		expect(sync.isInLibrary("movie", "tt1")).toBe(true);
	});

	it("keeps a just-flushed delete over a stale pull that still has the row", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")], 10));
		await sync.attach(1, USER_A);
		await sync.sync();

		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: true,
		});
		await sync.flushNow();

		remote.syncDeltas.mockResolvedValue({
			...NO_DELTAS,
			library: [libraryDelta(11, "tt1", "upsert")],
		});
		await sync.sync();
		expect(sync.isInLibrary("movie", "tt1")).toBe(false);
	});

	it("lets the server win once the grace period has passed", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")], 10));
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: true,
		});
		await sync.flushNow();

		// Only the clock moves: the grace period is measured against `Date.now()`,
		// and advancing timers would also fire the store's own initial-sync
		// timer, whose in-flight sync makes the one below return early.
		vi.setSystemTime(Date.now() + 16_000);
		remote.syncDeltas.mockResolvedValue({
			...NO_DELTAS,
			library: [libraryDelta(12, "tt1", "upsert")],
		});
		await sync.sync();
		expect(sync.isInLibrary("movie", "tt1")).toBe(true);
	});
});

describe("cursors", () => {
	it("advances the cursors to the newest event it applied", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();

		remote.syncDeltas.mockResolvedValue({
			...NO_DELTAS,
			library: [libraryDelta(15, "tt1"), libraryDelta(17, "tt2")],
		});
		await sync.sync();

		remote.syncDeltas.mockResolvedValue(NO_DELTAS);
		await sync.sync();
		expect(remote.syncDeltas).toHaveBeenLastCalledWith(
			expect.objectContaining({ library: 17 }),
		);
	});
});

function progress(position: number, extra: Partial<{ episode: number }> = {}) {
	return {
		contentId: "tt9",
		contentType: "series" as const,
		videoId: `tt9:1:${extra.episode ?? 1}`,
		season: 1,
		episode: extra.episode ?? 1,
		position,
		duration: 100,
	};
}

describe("watch progress", () => {
	it("derives resume fractions per title and per episode", async () => {
		await sync.attach(1, USER_A);
		sync.saveProgress(progress(25));
		sync.saveProgress(progress(50, { episode: 2 }));

		expect(Object.keys(sync.libraryProgress)).toEqual(["tt9"]);
		const perEpisode = sync.titleProgress("tt9");
		expect(
			Object.values(perEpisode)
				.map((entry) => entry.fraction)
				.sort(),
		).toEqual([0.25, 0.5]);
	});

	it("markWatched records a full watch, with a floor on the duration", async () => {
		await sync.attach(1, USER_A);
		sync.markWatched({
			contentId: "tt1",
			contentType: "movie",
			videoId: "tt1",
			season: null,
			episode: null,
			durationMs: 0,
		});
		const [row] = sync.progress;
		expect(row.duration).toBe(60_000);
		expect(row.position).toBe(row.duration);
	});

	it("clearProgress queues a delete, and does nothing for an unknown row", async () => {
		await sync.attach(1, USER_A);
		sync.clearProgress({ contentId: "nope", season: null, episode: null });
		expect(sync.mutated).toBe(false);

		sync.saveProgress(progress(25));
		await sync.flushNow();
		sync.clearProgress({ contentId: "tt9", season: 1, episode: 1 });
		expect(sync.progress).toEqual([]);

		await sync.flushNow();
		expect(
			remote.flushWrites.mock.calls.at(-1)?.[0].progressDeletes,
		).toHaveLength(1);
	});

	// "Mark unwatched" while the delete is still queued: a delta that still
	// carries the row must not resurrect it.
	it("a queued progress delete wins over a delta that still has the row", async () => {
		remote.flushWrites.mockRejectedValue(new Error("offline"));
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.saveProgress(progress(25));
		sync.clearProgress({ contentId: "tt9", season: 1, episode: 1 });

		const key = "tt9_s1e1";
		remote.syncDeltas.mockResolvedValue({
			...NO_DELTAS,
			watchProgress: [
				{
					event_id: 20,
					operation: "upsert",
					progress_key: key,
					content_id: "tt9",
					content_type: "series",
					video_id: "tt9:1:1",
					season: 1,
					episode: 1,
					position: 25,
					duration: 100,
					last_watched: 1,
				},
			],
		});
		await sync.sync();
		expect(sync.progress).toEqual([]);
	});
});

describe("clear", () => {
	it("empties this owner's mirror and treats the empty state as synced", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")]));
		await sync.attach(1, USER_A);
		await sync.sync();

		await sync.clear();
		expect(sync.library).toEqual([]);
		expect(sync.synced).toBe(true);
		expect(sync.mutated).toBe(false);

		sync = await freshStore();
		await sync.attach(1, USER_A);
		expect(sync.library).toEqual([]);
	});
});

describe("cross-tab coherence", () => {
	it("a write in one tab shows up in another tab on the same owner", async () => {
		await sync.attach(1, USER_A);
		const other = await freshStore();
		await other.attach(1, USER_A);

		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
		});
		await vi.waitFor(() => {
			expect(other.isInLibrary("movie", "tt1")).toBe(true);
		});
		expect(other.mutated).toBe(true);
	});

	it("does not reach a tab on another account", async () => {
		await sync.attach(1, USER_A);
		const other = await freshStore();
		await other.attach(1, USER_B);

		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: false,
		});
		// Give a message every chance to arrive before asserting it didn't.
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));
		expect(other.isInLibrary("movie", "tt1")).toBe(false);
	});
});

describe("scheduling", () => {
	it("syncs on its own after the initial delay", async () => {
		await sync.attach(1, USER_A);
		expect(remote.syncSnapshot).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(4000);
		expect(remote.syncSnapshot).toHaveBeenCalledTimes(1);
	});

	it("syncs when the tab becomes visible again", async () => {
		await sync.attach(1, USER_A);
		document.dispatchEvent(new Event("visibilitychange"));
		// Not `vi.waitFor`: under fake timers it advances the clock between
		// checks, which fires the initial-sync timer and muddies the count.
		await vi.advanceTimersByTimeAsync(0);
		expect(remote.syncSnapshot).toHaveBeenCalledTimes(1);
	});

	it("does not touch the network while offline", async () => {
		// Node's `navigator` has no `onLine` at all (the store reads a missing one
		// as online), so it is defined here rather than spied on.
		Object.defineProperty(navigator, "onLine", {
			configurable: true,
			get: () => false,
		});
		try {
			await sync.attach(1, USER_A);
			sync.toggleLibrary({
				contentId: "tt1",
				contentType: "movie",
				remove: false,
			});
			await sync.sync();
			await sync.flushNow();
			expect(remote.syncSnapshot).not.toHaveBeenCalled();
			expect(remote.flushWrites).not.toHaveBeenCalled();
			expect(sync.isInLibrary("movie", "tt1")).toBe(true);
		} finally {
			Reflect.deleteProperty(navigator, "onLine");
		}
	});

	it("does nothing before attach", async () => {
		await sync.sync();
		await sync.flushNow();
		expect(remote.syncSnapshot).not.toHaveBeenCalled();
	});
});

describe("switching profile mid-sync", () => {
	// The profile picker can fire while a snapshot or a delta pull is in
	// flight. Whatever that request returns belongs to the profile that asked
	// for it, and must not land on the one that is now attached.
	it("drops a snapshot that resolves after the profile changed", async () => {
		let resolveSnapshot: (value: ReturnType<typeof snapshot>) => void =
			() => {};
		remote.syncSnapshot.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveSnapshot = resolve;
			}),
		);
		await sync.attach(1, USER_A);
		const inFlight = sync.sync();

		await sync.attach(2, USER_A);
		resolveSnapshot(snapshot([libraryItem("profile-1-title")]));
		await inFlight;

		expect(sync.library).toEqual([]);
		expect(sync.synced).toBe(false);
	});

	it("drops a delta pull that resolves after the profile changed", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();

		let resolveDeltas: (value: Deltas) => void = () => {};
		remote.syncDeltas.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveDeltas = resolve;
			}),
		);
		const inFlight = sync.sync();
		await sync.attach(2, USER_A);
		resolveDeltas({
			...NO_DELTAS,
			library: [libraryDelta(50, "profile-1-title")],
		});
		await inFlight;

		expect(sync.library).toEqual([]);
	});
});

describe("bootstrap contents", () => {
	it("takes progress and history from the snapshot, newest first", async () => {
		remote.syncSnapshot.mockResolvedValue({
			...snapshot(),
			watchProgress: [
				{
					progress_key: "tt1",
					content_id: "tt1",
					content_type: "movie",
					video_id: "tt1",
					season: null,
					episode: null,
					position: 30,
					duration: 100,
					last_watched: 500,
				},
			],
			watchHistory: [
				{
					content_id: "tt1",
					content_type: "movie",
					title: "One",
					season: null,
					episode: null,
					watched_at: 100,
				},
				{
					content_id: "tt2",
					content_type: "movie",
					title: "Two",
					season: null,
					episode: null,
					watched_at: 300,
				},
			],
		});
		await sync.attach(1, USER_A);
		await sync.sync();

		expect(sync.progress.map((row) => row.progressKey)).toEqual(["tt1"]);
		expect(sync.history.map((entry) => entry.contentId)).toEqual([
			"tt2",
			"tt1",
		]);
	});
});

describe("polling and races", () => {
	it("polls every ninety seconds", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();
		const before = remote.syncDeltas.mock.calls.length;

		await vi.advanceTimersByTimeAsync(90_000);
		expect(remote.syncDeltas.mock.calls.length).toBeGreaterThan(before);
	});

	// Picking profile 2 while profile 1's IndexedDB reads are still pending: the
	// slower attach must not publish its rows over the newer one.
	it("a slower attach does not overwrite a newer one", async () => {
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("profile-1")]));
		await sync.attach(1, USER_A);
		await sync.sync();
		sync.detach();

		sync = await freshStore();
		const first = sync.attach(1, USER_A);
		const second = sync.attach(2, USER_A);
		await Promise.all([first, second]);

		expect(sync.library).toEqual([]);
	});
});
