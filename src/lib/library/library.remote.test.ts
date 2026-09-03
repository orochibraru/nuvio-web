import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { libraryPull: vi.fn() };

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: { library: { pull: state.libraryPull } },
		profileId: 7,
	}),
}));

import { libraryIds } from "./library.remote.ts";

beforeEach(() => {
	state.libraryPull = vi.fn(async () => []);
});

describe("libraryIds", () => {
	it("returns just the content ids for the active profile", async () => {
		state.libraryPull = vi.fn(async () => [
			{ content_id: "tt1" },
			{ content_id: "tt2" },
		]);
		expect(await libraryIds()).toEqual(["tt1", "tt2"]);
		expect(state.libraryPull).toHaveBeenCalledWith({
			p_profile_id: 7,
			p_limit: 500,
		});
	});
});
