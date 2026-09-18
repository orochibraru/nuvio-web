import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	getAddonClient: vi.fn(),
}));
vi.mock("#lib/addons/server.js", () => ({
	getAddonClient: state.getAddonClient,
}));

import type { MetaPreview } from "#lib/addons/types.js";
import type { CollectionFolder } from "#lib/nuvio/index.js";
import {
	type CatalogFetcher,
	folderContents,
	pullFolderContents,
} from "./collections-data.ts";

const meta = (id: string) => ({ type: "movie", id }) as MetaPreview;

function fetcher(
	byCatalog: Record<string, MetaPreview[] | Error>,
): CatalogFetcher & {
	getCatalog: ReturnType<typeof vi.fn>;
} {
	return {
		getCatalog: vi.fn(async ({ id }: { id: string }) => {
			const result = byCatalog[id];
			if (result instanceof Error) {
				throw result;
			}
			return { metas: result ?? [] };
		}),
	};
}

const folder = (id: string, catalogIds: string[]): CollectionFolder => ({
	id,
	title: id,
	catalogSources: catalogIds.map((catalogId) => ({
		addonId: "a",
		type: "movie",
		catalogId,
	})),
});

describe("folderContents", () => {
	it("merges a folder's sources in order and de-dupes by type:id", async () => {
		const client = fetcher({
			top: [meta("m1"), meta("m2")],
			new: [meta("m2"), meta("m3")],
		});
		const [contents] = await folderContents(client, [
			folder("f1", ["top", "new"]),
		]);
		expect(contents.metas.map((entry) => entry.id)).toEqual(["m1", "m2", "m3"]);
	});

	it("keeps each folder's titles to itself, in folder order", async () => {
		const client = fetcher({ a: [meta("x")], b: [meta("y")] });
		const result = await folderContents(client, [
			folder("f1", ["a"]),
			folder("f2", ["b"]),
		]);
		expect(
			result.map((entry) => [entry.id, entry.metas.map((m) => m.id)]),
		).toEqual([
			["f1", ["x"]],
			["f2", ["y"]],
		]);
	});

	it("lets a failing source contribute nothing, not fail its folder", async () => {
		const client = fetcher({ ok: [meta("m1")], boom: new Error("addon down") });
		const [contents] = await folderContents(client, [
			folder("f1", ["boom", "ok"]),
		]);
		expect(contents.metas.map((entry) => entry.id)).toEqual(["m1"]);
	});

	it("returns an empty folder for one with no sources", async () => {
		const client = fetcher({});
		expect(
			await folderContents(client, [{ id: "f1", title: "Empty" }]),
		).toEqual([{ id: "f1", metas: [] }]);
		expect(client.getCatalog).not.toHaveBeenCalled();
	});

	it("caps how many catalog requests run at once", async () => {
		let inFlight = 0;
		let peak = 0;
		const client: CatalogFetcher = {
			getCatalog: async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight--;
				return { metas: [] };
			},
		};
		await folderContents(client, [
			folder("f1", ["a", "b", "c"]),
			folder("f2", ["d", "e", "f"]),
		]);
		expect(peak).toBeLessThanOrEqual(4);
	});
});

describe("pullFolderContents", () => {
	it("is empty without a collection, or when the addons are unreachable", async () => {
		expect(await pullFolderContents(null)).toEqual([]);

		state.getAddonClient.mockRejectedValueOnce(new Error("no profile"));
		expect(
			await pullFolderContents({
				id: "c",
				title: "C",
				folders: [folder("f1", ["a"])],
			}),
		).toEqual([]);
	});

	it("fans out through this request's addon client", async () => {
		state.getAddonClient.mockResolvedValueOnce({
			client: fetcher({ a: [meta("m1")] }),
		});
		const result = await pullFolderContents({
			id: "c",
			title: "C",
			folders: [folder("f1", ["a"])],
		});
		expect(result[0].metas.map((entry) => entry.id)).toEqual(["m1"]);
	});
});
