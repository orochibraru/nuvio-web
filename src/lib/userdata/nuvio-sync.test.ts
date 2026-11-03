import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { Logger, type NuvioCredentials } from "#lib/services/index.js";
import type { LibraryRecord } from "#lib/sync/types.js";
import { UserDataEvents } from "./events.ts";
import { NuvioSync, pushCalls } from "./nuvio-sync.ts";
import { type OutboxEntry, UserDataStore } from "./store.ts";

const U = "user-1";

function fakeClient() {
	return {
		library: {
			deltaCursor: vi.fn(async () => 11),
			pull: vi.fn(async (_params: unknown) => [] as unknown[]),
			pullDelta: vi.fn(async () => [] as unknown[]),
			upsertItems: vi.fn(async () => undefined),
			deleteItems: vi.fn(async () => undefined),
		},
		watchProgress: {
			deltaCursor: vi.fn(async () => 22),
			pull: vi.fn(async (_params: unknown) => [] as unknown[]),
			pullDelta: vi.fn(async () => [] as unknown[]),
			push: vi.fn(async () => undefined),
			deleteMany: vi.fn(async () => undefined),
		},
		watchHistory: {
			deltaCursor: vi.fn(async () => 33),
			pull: vi.fn(async (_params: unknown) => [] as unknown[]),
			pullDelta: vi.fn(async () => [] as unknown[]),
			push: vi.fn(async () => undefined),
			delete: vi.fn(async () => undefined),
		},
	};
}

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

const libraryItem = (id: string, addedAt: number) => ({
	content_id: id,
	content_type: "movie",
	name: id,
	poster: null,
	background: null,
	description: null,
	release_info: null,
	imdb_rating: null,
	genres: [],
	added_at: addedAt,
});

let client: ReturnType<typeof fakeClient>;
let store: UserDataStore;
let tokens: {
	credentialsFor: ReturnType<
		typeof vi.fn<(accountKey: string) => Promise<NuvioCredentials | null>>
	>;
};
let logged: string[];
let sync: NuvioSync;
let now: number;

beforeEach(() => {
	now = 1_000_000;
	client = fakeClient();
	const db = new Database(":memory:");
	store = new UserDataStore(
		{ connect: () => db },
		new UserDataEvents(),
		() => now,
	);
	tokens = {
		credentialsFor: vi.fn(
			async (_accountKey: string): Promise<NuvioCredentials | null> => ({
				accessToken: "token",
				backend: null,
			}),
		),
	};
	logged = [];
	const sink = {
		out: (line: string) => logged.push(line),
		err: (line: string) => logged.push(line),
	};
	sync = new NuvioSync(store, tokens, new Logger("debug", sink), {
		clientFor: () => client as unknown as NuvioClient,
		now: () => now,
	});
});

afterEach(() => {
	sync.dispose();
	vi.useRealTimers();
});

async function imported(profileId = 1): Promise<void> {
	await sync.ensureImported(U, profileId, client as unknown as NuvioClient);
}

describe("ensureImported", () => {
	it("copies the profile from Nuvio once, cursors first", async () => {
		client.library.pull.mockResolvedValue([libraryItem("tt1", 5)]);
		const nuvio = client as unknown as NuvioClient;

		const [first, second] = await Promise.all([
			sync.ensureImported(U, 1, nuvio),
			sync.ensureImported(U, 1, nuvio),
		]);
		expect([first, second]).toEqual([true, true]);
		expect(client.library.pull).toHaveBeenCalledTimes(1);
		expect(store.list(U, 1, "library").map((item) => item.contentId)).toEqual([
			"tt1",
		]);
		expect(store.profile(U, 1)?.nuvioCursors).toEqual({
			library: 11,
			progress: 22,
			history: 33,
		});

		expect(await sync.ensureImported(U, 1, nuvio)).toBe(true);
		expect(client.library.pull).toHaveBeenCalledTimes(1);
	});

	it("pages every collection until a short page, not just the first 1000 rows", async () => {
		const rows = (count: number, from: number) =>
			Array.from({ length: count }, (_, index) => from + index);
		// 2500 rows each: two full pages and a half one.
		const pageOf = (page: number) => rows(page < 2 ? 1000 : 500, page * 1000);
		client.library.pull.mockImplementation(async (params) =>
			pageOf((params as { p_offset: number }).p_offset / 1000).map((n) =>
				libraryItem(`tt${n}`, n + 1),
			),
		);
		client.watchHistory.pull.mockImplementation(async (params) =>
			pageOf((params as { p_page: number }).p_page - 1).map((n) => ({
				content_id: `tt${n}`,
				content_type: "movie",
				title: `tt${n}`,
				season: null,
				episode: null,
				watched_at: n + 1,
			})),
		);
		// Progress pages by `last_watched`, oldest first; rows 999 and 1000 share
		// a timestamp across the first page boundary.
		const progressRows = rows(2500, 0).map((n) => ({
			progress_key: `tt${n}`,
			content_id: `tt${n}`,
			content_type: "movie",
			video_id: `tt${n}`,
			season: null,
			episode: null,
			position: 1,
			duration: 2,
			last_watched: n === 1000 ? 1000 : n + 1,
		}));
		client.watchProgress.pull.mockImplementation(async (params) => {
			const { p_since_last_watched: since, p_limit: limit } = params as {
				p_since_last_watched: number;
				p_limit: number;
			};
			return progressRows
				.filter((row) => row.last_watched > since)
				.slice(0, limit);
		});

		await imported();

		expect(store.list(U, 1, "library")).toHaveLength(2500);
		expect(store.list(U, 1, "history")).toHaveLength(2500);
		expect(store.list(U, 1, "progress")).toHaveLength(2500);
		expect(client.library.pull).toHaveBeenCalledTimes(3);
		expect(client.watchHistory.pull).toHaveBeenCalledTimes(3);
		expect(client.watchProgress.pull).toHaveBeenCalledWith(
			expect.objectContaining({ p_since_last_watched: 0 }),
		);
		expect(store.profile(U, 1)?.importedAt).not.toBeNull();
	});

	it("reports failure without throwing, and retries next time", async () => {
		client.library.deltaCursor.mockRejectedValueOnce(new Error("down"));
		expect(await sync.ensureImported(U, 1, client as never)).toBe(false);
		expect(store.profile(U, 1)).toBeNull();
		expect(logged.join("\n")).toContain("Nuvio import failed");

		expect(await sync.ensureImported(U, 1, client as never)).toBe(true);
	});
});

describe("syncUser", () => {
	it("skips a user with no token", async () => {
		tokens.credentialsFor.mockResolvedValue(null);
		await imported();
		await sync.syncUser(U);
		expect(client.library.pullDelta).not.toHaveBeenCalled();
	});

	it("skips, rather than throws, when the token lookup itself fails", async () => {
		tokens.credentialsFor.mockRejectedValue(new Error("database is locked"));
		await imported();
		await expect(sync.syncUser(U)).resolves.toBeUndefined();
		expect(client.library.pullDelta).not.toHaveBeenCalled();
	});

	it("pulls each feed from its cursor, then pushes the outbox", async () => {
		await imported();
		client.library.pullDelta.mockResolvedValueOnce([
			{ ...libraryItem("tt2", 50), event_id: 12, operation: "upsert" },
		]);
		store.applyWrites(U, 1, [
			{
				entity: "library",
				key: "movie:tt3",
				record: film("tt3"),
				deleted: false,
				at: 100,
			},
		]);

		await sync.syncUser(U);

		expect(client.library.pullDelta).toHaveBeenCalledWith({
			p_profile_id: 1,
			p_since_event_id: 11,
			p_limit: 1000,
		});
		expect(client.watchHistory.pullDelta).toHaveBeenCalledWith(
			expect.objectContaining({ p_since_event_id: 33 }),
		);
		expect(store.profile(U, 1)?.nuvioCursors.library).toBe(12);
		expect(store.list(U, 1, "library").map((item) => item.contentId)).toEqual([
			"tt3",
			"tt2",
		]);
		expect(client.library.upsertItems).toHaveBeenCalledTimes(1);
		expect(store.dueOutbox(U, 1)).toEqual([]);
	});

	it("keeps paging while a feed returns full pages", async () => {
		await imported();
		const page = Array.from({ length: 1000 }, (_, index) => ({
			...libraryItem(`tt${index}`, 1),
			event_id: 100 + index,
			operation: "upsert",
		}));
		client.library.pullDelta.mockResolvedValueOnce(page);
		await sync.syncUser(U);
		expect(client.library.pullDelta).toHaveBeenCalledTimes(2);
		expect(client.library.pullDelta).toHaveBeenLastCalledWith(
			expect.objectContaining({ p_since_event_id: 1099 }),
		);
	});

	it("backs off a failed push and keeps the rest of the sync going", async () => {
		await imported(1);
		await imported(2);
		for (const profileId of [1, 2]) {
			store.applyWrites(U, profileId, [
				{
					entity: "progress",
					key: "tt1",
					record: {
						progressKey: "tt1",
						contentId: "tt1",
						contentType: "movie",
						videoId: "tt1",
						season: null,
						episode: null,
						position: 1,
						duration: 2,
						lastWatched: 3,
					},
					deleted: false,
					at: 3,
				},
			]);
		}
		client.watchProgress.push.mockRejectedValueOnce(new Error("503"));

		await sync.syncUser(U);

		expect(store.dueOutbox(U, 1)).toEqual([]);
		now += 30_000;
		expect(store.dueOutbox(U, 1)).toHaveLength(1);
		expect(store.dueOutbox(U, 2)).toEqual([]);
		expect(logged.join("\n")).toContain("Nuvio push failed");
	});

	it("logs a failed pull and moves on", async () => {
		await imported();
		client.library.pullDelta.mockRejectedValueOnce(new Error("timeout"));
		await sync.syncUser(U);
		expect(logged.join("\n")).toContain("Nuvio sync failed");
	});

	it("is single-flight per user", async () => {
		await imported();
		const [a, b] = [sync.syncUser(U), sync.syncUser(U)];
		expect(a).toBe(b);
		await a;
		expect(tokens.credentialsFor).toHaveBeenCalledTimes(1);
	});
});

describe("scheduling", () => {
	it("touch syncs a stale user now, and not again within the window", async () => {
		sync.touch(U);
		sync.touch(U);
		await vi.waitFor(() => {
			expect(tokens.credentialsFor).toHaveBeenCalledTimes(1);
		});
		// Let that sync settle: a touch during a running one joins it.
		await new Promise((resolve) => setTimeout(resolve, 0));
		now += 31_000;
		sync.touch(U);
		await vi.waitFor(() => {
			expect(tokens.credentialsFor).toHaveBeenCalledTimes(2);
		});
	});

	it("the interval syncs recently active users and forgets idle ones", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		sync.touch(U);
		sync.touch("user-2");
		await vi.waitFor(() => {
			expect(tokens.credentialsFor).toHaveBeenCalledTimes(2);
		});

		now += 5 * 60_000;
		await vi.advanceTimersByTimeAsync(5 * 60_000);
		expect(tokens.credentialsFor).toHaveBeenCalledTimes(4);

		now += 31 * 60_000;
		await sync.tick();
		expect(tokens.credentialsFor).toHaveBeenCalledTimes(4);

		sync.dispose();
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(tokens.credentialsFor).toHaveBeenCalledTimes(4);
	});

	it("settle waits for the running sync and stops the schedule", async () => {
		await imported();
		let finished = false;
		const running = sync.syncUser(U).then(() => {
			finished = true;
		});
		await sync.settle();
		expect(finished).toBe(true);
		await running;
	});

	it("an unavailable store skips the sync rather than throwing", async () => {
		const broken = new UserDataStore(
			{
				connect: () => {
					throw new Error("read-only");
				},
			},
			new UserDataEvents(),
		);
		const brokenSync = new NuvioSync(
			broken,
			tokens,
			new Logger("error", {
				out: (line) => logged.push(line),
				err: (line) => logged.push(line),
			}),
			{ clientFor: () => client as unknown as NuvioClient },
		);
		await brokenSync.syncUser(U);
		expect(logged.join("\n")).toContain("User data store unavailable");
	});
});

describe("pushCalls", () => {
	const entry = (over: Partial<OutboxEntry>): OutboxEntry => ({
		entity: "library",
		key: "movie:tt1",
		record: film("tt1"),
		deleted: false,
		at: 1,
		seq: 1,
		attempts: 0,
		...over,
	});

	it("groups the outbox into one Nuvio call per entity and operation", async () => {
		const history = {
			id: "tt5:1:2",
			contentId: "tt5",
			contentType: "series" as const,
			title: "Five",
			season: 1,
			episode: 2,
			watchedAt: 9,
		};
		const calls = pushCalls(
			[
				entry({}),
				entry({ key: "movie:tt2", record: film("tt2"), deleted: true }),
				entry({
					entity: "progress",
					key: "tt3",
					record: {
						progressKey: "tt3",
						contentId: "tt3",
						contentType: "movie",
						videoId: "tt3",
						season: null,
						episode: null,
						position: 1.4,
						duration: 2.6,
						lastWatched: 3,
					},
				}),
				entry({
					entity: "progress",
					key: "tt4",
					deleted: true,
					record: {
						progressKey: "tt4",
					} as never,
				}),
				entry({ entity: "history", key: history.id, record: history }),
				entry({
					entity: "history",
					key: history.id,
					record: history,
					deleted: true,
				}),
			],
			7,
		);
		expect(calls).toHaveLength(6);
		for (const call of calls) {
			await call.send(client as unknown as NuvioClient);
		}

		expect(client.library.upsertItems).toHaveBeenCalledWith(
			expect.objectContaining({
				p_profile_id: 7,
				p_origin_client_id: "nuvio-web",
				p_items: [
					expect.objectContaining({ content_id: "tt1", poster: undefined }),
				],
			}),
		);
		expect(client.library.deleteItems).toHaveBeenCalledWith(
			expect.objectContaining({
				p_keys: [{ content_id: "tt2", content_type: "movie" }],
			}),
		);
		expect(client.watchProgress.push).toHaveBeenCalledWith({
			p_profile_id: 7,
			p_entries: [
				expect.objectContaining({
					position: 1,
					duration: 3,
					season: undefined,
				}),
			],
		});
		expect(client.watchProgress.deleteMany).toHaveBeenCalledWith(["tt4"], 7);
		expect(client.watchHistory.push).toHaveBeenCalledWith({
			p_profile_id: 7,
			p_items: [
				{
					content_id: "tt5",
					content_type: "series",
					title: "Five",
					watched_at: 9,
					season: 1,
					episode: 2,
				},
			],
		});
		expect(client.watchHistory.delete).toHaveBeenCalledWith(
			[{ content_id: "tt5", season: 1, episode: 2 }],
			7,
		);
	});

	it("makes no call for an empty outbox", () => {
		expect(pushCalls([], 1)).toEqual([]);
	});
});
