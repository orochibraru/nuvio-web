import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	collectionsPull: vi.fn(),
	collectionsReplace: vi.fn(),
	getCatalog: vi.fn(),
};

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: {
			collections: {
				pull: state.collectionsPull,
				replace: state.collectionsReplace,
			},
		},
		profileId: 1,
	}),
}));

vi.mock("#lib/addons/server.js", () => ({
	getAddonClient: async () => ({ client: { getCatalog: state.getCatalog } }),
}));

import { collectionContents, saveCollections } from "./collections.remote.ts";

beforeEach(() => {
	state.collectionsPull = vi.fn(async () => []);
	state.collectionsReplace = vi.fn(async () => undefined);
	state.getCatalog = vi.fn(async () => ({ metas: [] }));
});

describe("saveCollections", () => {
	it("replaces the blob and reports the count", async () => {
		const out = await saveCollections([
			{ id: "c1", title: "One", folders: [] },
		]);
		expect(out).toEqual({ count: 1 });
		expect(state.collectionsReplace).toHaveBeenCalledWith({
			p_profile_id: 1,
			p_collections_json: [{ id: "c1", title: "One", folders: [] }],
		});
	});
});

describe("collectionContents", () => {
	it("throws 404 when the id isn't in the blob", async () => {
		state.collectionsPull = vi.fn(async () => [
			{ collections_json: [{ id: "other", title: "x", folders: [] }] },
		]);
		await expect(collectionContents("missing")).rejects.toMatchObject({
			status: 404,
		});
	});

	it("merges a folder's catalog sources and de-dupes by type:id", async () => {
		state.collectionsPull = vi.fn(async () => [
			{
				collections_json: [
					{
						id: "c1",
						title: "Mine",
						folders: [
							{
								id: "f1",
								title: "Folder",
								catalogSources: [
									{ addonId: "a", type: "movie", catalogId: "top" },
									{ addonId: "b", type: "movie", catalogId: "new" },
								],
							},
						],
					},
				],
			},
		]);
		state.getCatalog = vi.fn(async (sel: { id: string }) => ({
			metas:
				sel.id === "top"
					? [
							{ type: "movie", id: "m1" },
							{ type: "movie", id: "m2" },
						]
					: [
							{ type: "movie", id: "m2" },
							{ type: "movie", id: "m3" },
						],
		}));

		const out = await collectionContents("c1");
		expect(out.viewMode).toBe("TABBED_GRID");
		expect(out.folders[0].metas.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
	});

	it("tolerates a failing catalog source", async () => {
		state.collectionsPull = vi.fn(async () => [
			{
				collections_json: [
					{
						id: "c1",
						title: "Mine",
						folders: [
							{
								id: "f1",
								title: "Folder",
								catalogSources: [
									{ addonId: "a", type: "movie", catalogId: "boom" },
								],
							},
						],
					},
				],
			},
		]);
		state.getCatalog = vi.fn(async () => {
			throw new Error("addon down");
		});

		const out = await collectionContents("c1");
		expect(out.folders[0].metas).toEqual([]);
	});
});
