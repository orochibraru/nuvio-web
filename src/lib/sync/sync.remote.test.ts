import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "#lib/services/index.js";
import { UserDataEvents } from "#lib/userdata/events.js";
import { UserDataStore } from "#lib/userdata/store.js";
import { NUVIO_SYNC, USER_DATA_STORE } from "#lib/userdata/tokens.js";

const state = vi.hoisted(() => ({ services: null as unknown }));
const nuvio = { marker: "request client" };
const nuvioSync = { ensureImported: vi.fn(), touch: vi.fn() };

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: { services: state.services } },
		nuvio,
		profileId: 9,
		userId: "user-1",
	}),
}));

import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.ts";

const empty = {
	libraryUpserts: [],
	libraryDeletes: [],
	progressPushes: [],
	progressDeletes: [],
	historyDeletes: [],
};

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

		const snap = await syncSnapshot();
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
			progressDeletes: ["tt2"],
		});

		const out = await syncDeltas({
			library: 0,
			watchProgress: 0,
			watchHistory: 0,
		});
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
				historyDeletes: [{ content_id: "tt3", season: 1, episode: 2 }],
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
