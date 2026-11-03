import { Database } from "bun:sqlite";
import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "#lib/services/index.js";
import { UserDataEvents } from "#lib/userdata/events.js";
import { UserDataStore } from "#lib/userdata/store.js";
import { NUVIO_SYNC, USER_DATA_STORE } from "#lib/userdata/tokens.js";

const state = vi.hoisted(() => ({ services: null as unknown }));
const nuvio = { marker: "request client" };
const nuvioSync = { ensureImported: vi.fn(), touch: vi.fn() };

// The handler, with its schema kept on it so a test can validate against it.
function remoteFunction(schemaOrFn: unknown, fn?: object) {
	return fn ? Object.assign(fn, { schema: schemaOrFn }) : schemaOrFn;
}
vi.mock("$app/server", () => ({
	query: remoteFunction,
	command: remoteFunction,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: { services: state.services } },
		nuvio,
		profileId: 9,
		accountKey: "user-1",
	}),
}));

import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.ts";

const empty = {
	profileId: 9,
	libraryUpserts: [],
	libraryDeletes: [],
	progressPushes: [],
	progressDeletes: [],
	historyDeletes: [],
	historyRestores: [],
};

const ZERO = { library: 0, watchProgress: 0, watchHistory: 0 };

async function status(run: () => unknown): Promise<number> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
	return 200;
}

let store: UserDataStore;

beforeEach(() => {
	const db = new Database(":memory:");
	store = new UserDataStore({ connect: () => db }, new UserDataEvents());
	nuvioSync.ensureImported.mockReset().mockResolvedValue(true);
	nuvioSync.touch.mockReset();
	state.services = new Container("test")
		.provide(USER_DATA_STORE, store)
		.provide(NUVIO_SYNC, nuvioSync as never);
});

describe("syncSnapshot", () => {
	it("imports the profile first, then serves the local store", async () => {
		await flushWrites({
			...empty,
			libraryUpserts: [
				{ content_id: "tt1", content_type: "movie", added_at: 5 },
			],
		});

		const snap = await syncSnapshot({ profileId: 9 });
		expect(nuvioSync.ensureImported).toHaveBeenCalledWith("user-1", 9, nuvio);
		expect(nuvioSync.touch).toHaveBeenCalledWith("user-1");
		expect(snap.library.map((item) => item.contentId)).toEqual(["tt1"]);
		expect(snap.cursors.library).toBe(1);
	});
});

describe("syncDeltas", () => {
	it("returns what changed past the client's cursors", async () => {
		await flushWrites({
			...empty,
			libraryUpserts: [
				{ content_id: "tt1", content_type: "movie", added_at: 5 },
			],
			progressDeletes: [{ progress_key: "tt2", deleted_at: Date.now() }],
		});

		const out = await syncDeltas({ profileId: 9, cursors: ZERO });
		expect(Object.keys(out.changes.library ?? {})).toEqual(["movie:tt1"]);
		expect(out.changes.progress).toEqual({ tt2: null });
		expect(out.cursors).toEqual({
			library: 2,
			watchProgress: 2,
			watchHistory: 2,
		});
		expect(nuvioSync.touch).toHaveBeenCalled();
	});
});

describe("flushWrites", () => {
	it("writes to the store and queues the rows for Nuvio", async () => {
		expect(
			await flushWrites({
				...empty,
				progressPushes: [
					{
						content_id: "tt1",
						content_type: "movie",
						video_id: "tt1",
						position: 1234.7,
						duration: 5678.2,
						last_watched: 42,
					},
				],
				historyDeletes: [
					{ content_id: "tt3", season: 1, episode: 2, deleted_at: 50 },
				],
			}),
		).toEqual({ ok: true });

		const [row] = store.list("user-1", 9, "progress");
		expect(row).toMatchObject({ position: 1235, duration: 5678 });
		expect(
			store
				.dueOutbox("user-1", 9)
				.map((entry) => `${entry.entity}:${entry.key}`),
		).toEqual(["progress:tt1", "history:tt3:1:2"]);
	});
});

describe("profile check", () => {
	// Another tab switched the shared profile cookie to 9; this tab still shows 3.
	it("refuses every call made for a profile that is no longer active", async () => {
		expect(await status(() => syncSnapshot({ profileId: 3 }))).toBe(409);
		expect(
			await status(() => syncDeltas({ profileId: 3, cursors: ZERO })),
		).toBe(409);
		expect(
			await status(() =>
				flushWrites({
					...empty,
					profileId: 3,
					libraryUpserts: [
						{ content_id: "tt1", content_type: "movie", added_at: 5 },
					],
				}),
			),
		).toBe(409);
		expect(store.list("user-1", 9, "library")).toEqual([]);
		expect(store.list("user-1", 3, "library")).toEqual([]);
		expect(nuvioSync.ensureImported).not.toHaveBeenCalled();
	});
});

describe("flushWrites limits", () => {
	const schema = (flushWrites as unknown as { schema: v.GenericSchema }).schema;
	const deletes = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			progress_key: `tt${index}`,
			deleted_at: 1,
		}));

	it("takes up to 500 writes per call, across every kind", () => {
		expect(
			v.safeParse(schema, { ...empty, progressDeletes: deletes(500) }).success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				...empty,
				progressDeletes: deletes(300),
				historyDeletes: Array.from({ length: 201 }, (_, index) => ({
					content_id: `tt${index}`,
					deleted_at: 1,
				})),
			}).success,
		).toBe(false);
		expect(
			v.safeParse(schema, { ...empty, progressDeletes: deletes(501) }).success,
		).toBe(false);
	});

	it("requires the client's profile id", () => {
		const { profileId: _, ...withoutProfile } = empty;
		expect(v.safeParse(schema, withoutProfile).success).toBe(false);
	});
});

describe("clock skew", () => {
	// The client's clock runs ten minutes behind the server's.
	it("a re-add after a remove wins, both dated by the same client clock", async () => {
		const client = Date.now() - 10 * 60_000;
		await flushWrites({
			...empty,
			libraryUpserts: [
				{ content_id: "tt1", content_type: "movie", added_at: client },
			],
		});
		await flushWrites({
			...empty,
			libraryDeletes: [
				{ content_id: "tt1", content_type: "movie", deleted_at: client + 1000 },
			],
		});
		await flushWrites({
			...empty,
			libraryUpserts: [
				{ content_id: "tt1", content_type: "movie", added_at: client + 2000 },
			],
		});
		expect(
			store.list("user-1", 9, "library").map((row) => row.contentId),
		).toEqual(["tt1"]);
	});
});
