import { beforeEach, describe, expect, it, vi } from "vitest";

const nuvio = {
	library: {
		deltaCursor: vi.fn(),
		pull: vi.fn(),
		pullDelta: vi.fn(),
		upsertItems: vi.fn(),
		deleteItems: vi.fn(),
	},
	watchProgress: {
		deltaCursor: vi.fn(),
		pull: vi.fn(),
		pullDelta: vi.fn(),
		push: vi.fn(),
		deleteMany: vi.fn(),
	},
	watchHistory: {
		deltaCursor: vi.fn(),
		pull: vi.fn(),
		pullDelta: vi.fn(),
		delete: vi.fn(),
	},
};

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({ event: { locals: {}, fetch }, nuvio, profileId: 9 }),
}));

import { flushWrites, syncDeltas, syncSnapshot } from "./sync.remote.js";

beforeEach(() => {
	for (const domain of Object.values(nuvio)) {
		for (const fn of Object.values(domain)) {
			fn.mockReset().mockResolvedValue([]);
		}
	}
	nuvio.library.deltaCursor.mockResolvedValue(10);
	nuvio.watchProgress.deltaCursor.mockResolvedValue(20);
	nuvio.watchHistory.deltaCursor.mockResolvedValue(30);
});

describe("syncSnapshot", () => {
	it("reads delta cursors before the snapshot pulls", async () => {
		const order: string[] = [];
		nuvio.library.deltaCursor.mockImplementation(async () => {
			order.push("cursor");
			return 10;
		});
		nuvio.library.pull.mockImplementation(async () => {
			order.push("pull");
			return [];
		});

		const out = await syncSnapshot();
		expect(out.cursors).toEqual({
			library: 10,
			watchProgress: 20,
			watchHistory: 30,
		});
		expect(order.indexOf("cursor")).toBeLessThan(order.indexOf("pull"));
	});
});

describe("syncDeltas", () => {
	it("passes each domain's cursor through as the since-id", async () => {
		await syncDeltas({ library: 1, watchProgress: 2, watchHistory: 3 });
		expect(nuvio.library.pullDelta).toHaveBeenCalledWith(
			expect.objectContaining({ p_since_event_id: 1, p_profile_id: 9 }),
		);
		expect(nuvio.watchHistory.pullDelta).toHaveBeenCalledWith(
			expect.objectContaining({ p_since_event_id: 3 }),
		);
	});
});

describe("flushWrites", () => {
	const empty = {
		libraryUpserts: [],
		libraryDeletes: [],
		progressPushes: [],
		progressDeletes: [],
		historyDeletes: [],
	};

	it("skips every domain call when the batch is empty", async () => {
		expect(await flushWrites({ ...empty })).toEqual({ ok: true });
		expect(nuvio.library.upsertItems).not.toHaveBeenCalled();
		expect(nuvio.watchProgress.push).not.toHaveBeenCalled();
		expect(nuvio.watchProgress.deleteMany).not.toHaveBeenCalled();
	});

	it("rounds progress position/duration and forwards the origin id", async () => {
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
		});
		const arg = nuvio.watchProgress.push.mock.calls[0][0];
		expect(arg.p_entries[0]).toMatchObject({ position: 1235, duration: 5678 });
	});

	it("chunks library upserts over the 500 limit", async () => {
		const libraryUpserts = Array.from({ length: 501 }, (_, i) => ({
			content_id: `tt${i}`,
			content_type: "movie" as const,
			added_at: 0,
		}));
		await flushWrites({ ...empty, libraryUpserts });
		expect(nuvio.library.upsertItems).toHaveBeenCalledTimes(2);
	});

	it("routes progress + history deletes to their own calls", async () => {
		await flushWrites({
			...empty,
			progressDeletes: ["a", "b"],
			historyDeletes: [{ content_id: "tt1", season: 1, episode: 2 }],
		});
		expect(nuvio.watchProgress.deleteMany).toHaveBeenCalledWith(["a", "b"], 9);
		expect(nuvio.watchHistory.delete).toHaveBeenCalledWith(
			[{ content_id: "tt1", season: 1, episode: 2 }],
			9,
		);
	});
});
