import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	historyPull: vi.fn(),
	getMeta: vi.fn(),
};

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: { watchHistory: { pull: state.historyPull } },
		profileId: 1,
	}),
}));

vi.mock("#lib/addons/server.js", () => ({
	getAddonClient: async () => ({ client: { getMeta: state.getMeta } }),
}));

import { watchHistory } from "./history.remote.js";

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

beforeEach(() => {
	state.historyPull = vi.fn(async () => []);
	state.getMeta = vi.fn(async () => null);
});

describe("watchHistory", () => {
	it("enriches rows with poster + name, falling back to the content id", async () => {
		state.historyPull = vi.fn(async () => [row({ id: "a" }), row({ id: "b" })]);
		state.getMeta = vi.fn(async () => ({
			meta: { name: "The Movie", poster: "p.jpg" },
		}));

		const out = await watchHistory();
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			id: "a",
			title: "The Movie",
			poster: "p.jpg",
			watchedAt: 1000,
		});
		// one getMeta lookup covers both rows of the same title
		expect(state.getMeta).toHaveBeenCalledTimes(1);
	});

	it("prefers the row's own title over the meta name", async () => {
		state.historyPull = vi.fn(async () => [row({ title: "Stored Title" })]);
		state.getMeta = vi.fn(async () => ({ meta: { name: "Meta Name" } }));

		const [item] = await watchHistory();
		expect(item.title).toBe("Stored Title");
	});

	it("falls back to the content id when nothing names the title", async () => {
		state.historyPull = vi.fn(async () => [row({ content_id: "tt999" })]);
		const [item] = await watchHistory();
		expect(item.title).toBe("tt999");
		expect(item.poster).toBeNull();
	});

	it("tolerates a getMeta failure per title", async () => {
		state.historyPull = vi.fn(async () => [row()]);
		state.getMeta = vi.fn(async () => {
			throw new Error("addon down");
		});
		const [item] = await watchHistory();
		expect(item.title).toBe("tt1");
	});
});
