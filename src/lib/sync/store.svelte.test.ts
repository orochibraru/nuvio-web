import { IDBDatabase, IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryRecord, SyncChanges, SyncCursors } from "./types.ts";

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
vi.mock("$app/paths", () => ({ resolve: (path: string) => `/${path}` }));

/** The store's live stream, driven by hand. No network, no DOM. */
class FakeEventSource extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	static instances: FakeEventSource[] = [];
	readyState = FakeEventSource.CONNECTING;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(readonly url: string) {
		super();
		FakeEventSource.instances.push(this);
	}

	open(): void {
		this.readyState = FakeEventSource.OPEN;
		this.onopen?.();
	}

	/** A dropped connection the browser will retry, or one it gave up on. */
	fail(retrying = true): void {
		this.readyState = retrying
			? FakeEventSource.CONNECTING
			: FakeEventSource.CLOSED;
		this.onerror?.();
	}

	send(data: unknown): void {
		this.dispatchEvent(
			new MessageEvent("changes", { data: JSON.stringify(data) }),
		);
	}

	close(): void {
		this.readyState = FakeEventSource.CLOSED;
	}
}

function lastStream(): FakeEventSource {
	const stream = FakeEventSource.instances.at(-1);
	if (!stream) {
		throw new Error("no stream opened");
	}
	return stream;
}

const remote = vi.hoisted(() => ({
	syncSnapshot: vi.fn(),
	syncDeltas: vi.fn(),
	flushWrites: vi.fn(),
}));
vi.mock("./sync.remote.ts", () => remote);

type Store = typeof import("./store.svelte.ts").sync;

const USER_A = "user-a";
const USER_B = "user-b";

function libraryItem(id: string, addedAt = 1000): LibraryRecord {
	return {
		contentId: id,
		contentType: "movie",
		name: `Title ${id}`,
		poster: null,
		background: null,
		description: null,
		releaseInfo: null,
		imdbRating: null,
		genres: [],
		addedAt,
	};
}

function cursorsAt(cursor: number): SyncCursors {
	return { library: cursor, watchProgress: cursor, watchHistory: cursor };
}

function snapshot(library: LibraryRecord[] = [], cursor = 10) {
	return { cursors: cursorsAt(cursor), library, progress: [], history: [] };
}

interface Deltas {
	changes: SyncChanges;
	cursors: SyncCursors;
}

const NO_DELTAS: Deltas = { changes: {}, cursors: cursorsAt(10) };

/** A delta feed touching library rows only; `null` deletes the row. */
function libraryDeltas(
	cursor: number,
	...entries: Array<[id: string, operation?: "upsert" | "delete"]>
): Deltas {
	return {
		cursors: cursorsAt(cursor),
		changes: {
			library: Object.fromEntries(
				entries.map(([id, operation = "upsert"]) => [
					`movie:${id}`,
					operation === "delete" ? null : libraryItem(id, 2000),
				]),
			),
		},
	};
}

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
	FakeEventSource.instances = [];
	vi.stubGlobal("EventSource", FakeEventSource);
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"Date",
		],
	});
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
	vi.unstubAllGlobals();
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

		remote.syncDeltas.mockResolvedValue(libraryDeltas(11, ["tt1"]));
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
		remote.syncDeltas.mockResolvedValue(libraryDeltas(12, ["tt1"]));
		await sync.sync();
		expect(sync.isInLibrary("movie", "tt1")).toBe(true);
	});
});

describe("cursors", () => {
	it("advances to the cursors the server returned", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();

		remote.syncDeltas.mockResolvedValue(libraryDeltas(17, ["tt1"], ["tt2"]));
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
		expect(
			sync.progress.map((row) => row.position / row.duration).sort(),
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
			cursors: cursorsAt(20),
			changes: {
				progress: {
					[key]: {
						progressKey: key,
						contentId: "tt9",
						contentType: "series",
						videoId: "tt9:1:1",
						season: 1,
						episode: 1,
						position: 25,
						duration: 100,
						lastWatched: 1,
					},
				},
			},
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
		resolveDeltas(libraryDeltas(50, ["profile-1-title"]));
		await inFlight;

		expect(sync.library).toEqual([]);
	});
});

describe("bootstrap contents", () => {
	it("takes progress and history from the snapshot, newest first", async () => {
		const watched = (contentId: string, title: string, watchedAt: number) => ({
			id: `${contentId}::`,
			contentId,
			contentType: "movie" as const,
			title,
			season: null,
			episode: null,
			watchedAt,
		});
		remote.syncSnapshot.mockResolvedValue({
			...snapshot(),
			progress: [
				{
					progressKey: "tt1",
					contentId: "tt1",
					contentType: "movie",
					videoId: "tt1",
					season: null,
					episode: null,
					position: 30,
					duration: 100,
					lastWatched: 500,
				},
			],
			history: [watched("tt1", "One", 100), watched("tt2", "Two", 300)],
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

describe("incremental writes", () => {
	function episode(n: number) {
		return {
			contentId: "tt9",
			contentType: "series" as const,
			videoId: `tt9:1:${n}`,
			season: 1,
			episode: n,
			durationMs: 0,
		};
	}

	// Writes: every readwrite transaction opened. Rewrites: `replaceAll` is the
	// only writer that walks a cursor over the store (attach's purge does too,
	// so count only after attaching).
	function spyIdb() {
		const transaction = vi.spyOn(IDBDatabase.prototype, "transaction");
		const cursor = vi.spyOn(IDBObjectStore.prototype, "openKeyCursor");
		return {
			writes: () =>
				transaction.mock.calls.filter(([, mode]) => mode === "readwrite"),
			rewrites: () => cursor.mock.calls.length,
			restore: () => {
				transaction.mockRestore();
				cursor.mockRestore();
			},
		};
	}

	async function bootstrapped(store: Store): Promise<void> {
		remote.syncSnapshot.mockResolvedValue(
			snapshot([libraryItem("tt1"), libraryItem("tt2")]),
		);
		await store.attach(1, USER_A);
		await store.sync();
	}

	it("persists a single change with a put, not a rewrite of the store", async () => {
		await bootstrapped(sync);
		const idb = spyIdb();

		sync.markWatched(episode(1));
		await vi.waitFor(() => {
			expect(idb.writes()).toHaveLength(1);
		});
		expect([...idb.writes()[0][0]].sort()).toEqual(["meta", "progress"]);
		expect(idb.rewrites()).toBe(0);
		idb.restore();

		// The untouched library rows survived the put.
		sync = await freshStore();
		await sync.attach(1, USER_A);
		expect(sync.library.map((r) => r.contentId).sort()).toEqual(["tt1", "tt2"]);
		const row = sync.progress.find((entry) => entry.videoId === "tt9:1:1");
		expect(row && row.position >= row.duration).toBe(true);
	});

	it("persists a removal with a delete", async () => {
		await bootstrapped(sync);
		const idb = spyIdb();
		sync.toggleLibrary({
			contentId: "tt1",
			contentType: "movie",
			remove: true,
		});
		await vi.waitFor(() => {
			expect(idb.writes()).toHaveLength(1);
		});
		expect(idb.rewrites()).toBe(0);
		idb.restore();
		sync = await freshStore();
		await sync.attach(1, USER_A);
		expect(sync.library.map((r) => r.contentId)).toEqual(["tt2"]);
	});

	it("markManyWatched is one queue entry per episode, one persist and one broadcast", async () => {
		await bootstrapped(sync);
		const other = await freshStore();
		await other.attach(1, USER_A);
		const idb = spyIdb();
		const post = vi.spyOn(BroadcastChannel.prototype, "postMessage");

		sync.markManyWatched([episode(1), episode(2), episode(3), episode(2)]);

		expect(post).toHaveBeenCalledTimes(1);
		const message = post.mock.calls[0][0] as Record<string, unknown>;
		expect(message).not.toHaveProperty("library");
		expect(Object.keys(message.patch as object)).toEqual(["progress"]);
		expect(message.queue).toHaveLength(3);
		post.mockRestore();

		await vi.waitFor(() => {
			expect(idb.writes()).toHaveLength(1);
		});
		expect(idb.rewrites()).toBe(0);
		idb.restore();
		expect(sync.progress).toHaveLength(3);

		await vi.advanceTimersByTimeAsync(1500);
		expect(remote.flushWrites).toHaveBeenCalledTimes(1);
	});

	it("another tab applies a partial broadcast without losing untouched rows", async () => {
		await bootstrapped(sync);
		const other = await freshStore();
		await other.attach(1, USER_A);
		expect(other.library).toHaveLength(2);

		sync.markManyWatched([episode(1), episode(2)]);
		await vi.waitFor(() => {
			expect(other.progress).toHaveLength(2);
		});
		expect(other.library).toHaveLength(2);
		expect(other.mutated).toBe(true);

		sync.clearProgress({ contentId: "tt9", season: 1, episode: 1 });
		await vi.waitFor(() => {
			expect(other.progress.map((r) => r.episode)).toEqual([2]);
		});
	});
});

describe("full resync broadcast", () => {
	it("another tab adopts a bootstrap's whole state", async () => {
		await sync.attach(1, USER_A);
		const other = await freshStore();
		await other.attach(1, USER_A);
		remote.syncSnapshot.mockResolvedValue(snapshot([libraryItem("tt1")]));

		await sync.sync();
		await vi.waitFor(() => {
			expect(other.isInLibrary("movie", "tt1")).toBe(true);
		});
		expect(other.synced).toBe(true);
	});
});

describe("live stream", () => {
	/** A streamed change: `tt<id>` added, moving the cursors `from` → `to`. */
	function streamed(from: number, to: number, id = "tt5") {
		return { ...libraryDeltas(to, [id]), since: cursorsAt(from) };
	}

	async function attachedAndSynced(): Promise<FakeEventSource> {
		await sync.attach(1, USER_A);
		await sync.sync();
		const stream = lastStream();
		stream.open();
		remote.syncDeltas.mockClear();
		return stream;
	}

	it("opens one stream for the profile, closed on switch and detach", async () => {
		await sync.attach(1, USER_A);
		expect(FakeEventSource.instances).toHaveLength(1);
		expect(lastStream().url).toBe("/api/events");

		const first = lastStream();
		await sync.attach(2, USER_A);
		expect(first.readyState).toBe(FakeEventSource.CLOSED);
		expect(FakeEventSource.instances).toHaveLength(2);

		sync.detach();
		expect(lastStream().readyState).toBe(FakeEventSource.CLOSED);
	});

	it("applies a change that follows on from our cursors, without a pull", async () => {
		const stream = await attachedAndSynced();
		stream.send(streamed(10, 11));
		await vi.waitFor(() => {
			expect(sync.isInLibrary("movie", "tt5")).toBe(true);
		});
		expect(remote.syncDeltas).not.toHaveBeenCalled();

		// The next pull starts from the streamed cursors.
		await sync.sync();
		expect(remote.syncDeltas).toHaveBeenCalledWith(cursorsAt(11));
	});

	it("drops a change it already has", async () => {
		const stream = await attachedAndSynced();
		stream.send(streamed(9, 10));
		await vi.advanceTimersByTimeAsync(0);
		expect(sync.isInLibrary("movie", "tt5")).toBe(false);
		expect(remote.syncDeltas).not.toHaveBeenCalled();
	});

	it("fills a gap with one delta pull instead of applying out of order", async () => {
		const stream = await attachedAndSynced();
		remote.syncDeltas.mockResolvedValue(libraryDeltas(13, ["tt4"], ["tt5"]));
		stream.send(streamed(12, 13));
		await vi.waitFor(() => {
			expect(sync.isInLibrary("movie", "tt4")).toBe(true);
		});
		expect(remote.syncDeltas).toHaveBeenCalledTimes(1);
		expect(remote.syncDeltas).toHaveBeenCalledWith(cursorsAt(10));
	});

	it("a gap found mid-sync is filled by one more pull once it ends", async () => {
		const stream = await attachedAndSynced();
		let release = () => {};
		remote.syncDeltas.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = () => resolve(NO_DELTAS);
				}),
		);
		const running = sync.sync();
		await vi.advanceTimersByTimeAsync(0);
		stream.send(streamed(12, 13));
		await vi.advanceTimersByTimeAsync(0);
		expect(remote.syncDeltas).toHaveBeenCalledTimes(1);

		release();
		await running;
		expect(remote.syncDeltas).toHaveBeenCalledTimes(2);
	});

	it("bootstraps first when a change arrives before the snapshot", async () => {
		await sync.attach(1, USER_A);
		lastStream().send(streamed(10, 11));
		await vi.advanceTimersByTimeAsync(0);
		expect(remote.syncSnapshot).toHaveBeenCalledTimes(1);
	});

	it("does not broadcast a streamed change: every tab has its own stream", async () => {
		const stream = await attachedAndSynced();
		const other = await freshStore();
		await other.attach(1, USER_A);

		stream.send(streamed(10, 11));
		await vi.waitFor(() => {
			expect(sync.isInLibrary("movie", "tt5")).toBe(true);
		});
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));
		expect(other.isInLibrary("movie", "tt5")).toBe(false);
	});

	it("slows the poll to ten minutes while open, back to 90 s when it drops", async () => {
		const stream = await attachedAndSynced();
		await vi.advanceTimersByTimeAsync(4000); // the initial sync
		remote.syncDeltas.mockClear();
		await vi.advanceTimersByTimeAsync(90_000);
		expect(remote.syncDeltas).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10 * 60_000 - 94_000);
		expect(remote.syncDeltas).toHaveBeenCalledTimes(1);

		stream.fail();
		stream.fail(); // a failed retry must not restart the 90 s countdown
		remote.syncDeltas.mockClear();
		await vi.advanceTimersByTimeAsync(90_000);
		expect(remote.syncDeltas).toHaveBeenCalledTimes(1);
	});

	it("catches up once on reconnect", async () => {
		const stream = await attachedAndSynced();
		stream.fail();
		stream.open();
		await vi.advanceTimersByTimeAsync(0);
		expect(remote.syncDeltas).toHaveBeenCalledTimes(1);
	});

	it("reopens a stream the browser gave up on when the tab comes back", async () => {
		const stream = await attachedAndSynced();
		stream.fail(false);
		document.dispatchEvent(new Event("visibilitychange"));
		expect(FakeEventSource.instances).toHaveLength(2);
		expect(stream.readyState).toBe(FakeEventSource.CLOSED);
	});

	it("does not open a stream while offline", async () => {
		Object.defineProperty(navigator, "onLine", {
			configurable: true,
			get: () => false,
		});
		try {
			await sync.attach(1, USER_A);
			expect(FakeEventSource.instances).toHaveLength(0);
		} finally {
			Reflect.deleteProperty(navigator, "onLine");
		}
	});

	it("ignores a stream it has since replaced", async () => {
		await sync.attach(1, USER_A);
		await sync.sync();
		const stale = lastStream();
		stale.fail(false);
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		stale.send(streamed(10, 11));
		await vi.advanceTimersByTimeAsync(0);
		expect(sync.isInLibrary("movie", "tt5")).toBe(false);
	});
});
