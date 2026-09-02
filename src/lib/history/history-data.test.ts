import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { pullEnrichedHistory, pullWatchHistory } from "./history-data.ts";

const state = { historyPull: vi.fn() };

function nuvio(): NuvioClient {
	return {
		watchHistory: { pull: state.historyPull },
	} as unknown as NuvioClient;
}

function row(over: Record<string, unknown> = {}) {
	return {
		id: "h1",
		content_id: "tt1",
		content_type: "movie",
		title: "",
		season: null,
		episode: null,
		watched_at: 1000,
		...over,
	};
}

const lookup = (meta: Record<string, unknown> | null) =>
	vi.fn(async () => meta as never);

beforeEach(() => {
	state.historyPull = vi.fn(async () => []);
});

describe("pullWatchHistory", () => {
	it("shapes raw rows and falls back to the content id for a title", async () => {
		state.historyPull = vi.fn(async () => [row({ content_id: "tt9" })]);
		const [item] = await pullWatchHistory(nuvio(), 1);
		expect(item).toMatchObject({ contentId: "tt9", title: "tt9" });
	});

	it("is empty when the pull fails", async () => {
		state.historyPull = vi.fn(async () => {
			throw new Error("500");
		});
		expect(await pullWatchHistory(nuvio(), 1)).toEqual([]);
	});
});

describe("pullEnrichedHistory", () => {
	it("enriches rows with poster + name, one lookup per unique title", async () => {
		state.historyPull = vi.fn(async () => [row({ id: "a" }), row({ id: "b" })]);
		const lookupMeta = lookup({ name: "The Movie", poster: "p.jpg" });

		const out = await pullEnrichedHistory(nuvio(), 1, lookupMeta);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			id: "a",
			title: "The Movie",
			poster: "p.jpg",
			watchedAt: 1000,
		});
		// one lookup covers both rows of the same title
		expect(lookupMeta).toHaveBeenCalledTimes(1);
	});

	it("prefers the row's own title over the meta name", async () => {
		state.historyPull = vi.fn(async () => [row({ title: "Stored Title" })]);
		const [item] = await pullEnrichedHistory(
			nuvio(),
			1,
			lookup({ name: "Meta Name" }),
		);
		expect(item.title).toBe("Stored Title");
	});

	it("falls back to the content id when nothing names the title", async () => {
		state.historyPull = vi.fn(async () => [row({ content_id: "tt999" })]);
		const [item] = await pullEnrichedHistory(nuvio(), 1, lookup(null));
		expect(item.title).toBe("tt999");
		expect(item.poster).toBeNull();
	});

	it("tolerates a meta lookup failure per title", async () => {
		state.historyPull = vi.fn(async () => [row()]);
		const [item] = await pullEnrichedHistory(
			nuvio(),
			1,
			vi.fn(async () => {
				throw new Error("addon down");
			}),
		);
		expect(item.title).toBe("tt1");
	});

	it("never has more than a handful of lookups in flight at once", async () => {
		state.historyPull = vi.fn(async () =>
			Array.from({ length: 12 }, (_, i) =>
				row({ id: `h${i}`, content_id: `tt${i}` }),
			),
		);
		let active = 0;
		let peak = 0;
		const lookupMeta = vi.fn(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 5));
			active -= 1;
			return { name: "M" } as never;
		});

		await pullEnrichedHistory(nuvio(), 1, lookupMeta);
		expect(peak).toBeLessThanOrEqual(4);
	});
});
