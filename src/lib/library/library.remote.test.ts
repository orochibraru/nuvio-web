import { describe, expect, it, vi } from "vitest";

const { locals, fetch, profileData } = vi.hoisted(() => {
	const library = async () => [{ contentId: "tt1" }, { contentId: "tt2" }];
	return {
		locals: { marker: "locals" },
		fetch: () => undefined,
		profileData: vi.fn(() => ({ library })),
	};
});

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({ event: { locals, fetch } }),
}));

vi.mock("#lib/userdata/server.js", () => ({ profileData }));

import { libraryIds } from "./library.remote.ts";

describe("libraryIds", () => {
	it("returns just the content ids from the profile's local library", async () => {
		expect(await libraryIds()).toEqual(["tt1", "tt2"]);
		expect(profileData).toHaveBeenCalledWith(locals, fetch);
	});
});
