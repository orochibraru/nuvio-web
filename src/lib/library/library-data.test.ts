import { describe, expect, it } from "vitest";
import type { LibraryRecord, ProgressRecord } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import { pullLibraryItems, pullLibraryProgress } from "./library-data.ts";

function data(over: Partial<ProfileData>): ProfileData {
	return {
		library: async () => [],
		progress: async () => [],
		history: async () => [],
		...over,
	};
}

const failing = async (): Promise<never> => {
	throw new Error("down");
};

function film(over: Partial<LibraryRecord>): LibraryRecord {
	return {
		contentId: "tt1",
		contentType: "movie",
		name: "One",
		poster: null,
		background: null,
		description: null,
		releaseInfo: null,
		imdbRating: null,
		genres: [],
		addedAt: 1,
		...over,
	};
}

describe("pullLibraryItems", () => {
	it("maps stored rows to poster-card data", async () => {
		const items = await pullLibraryItems(
			data({
				library: async () => [
					film({ poster: "p1", releaseInfo: "2020", imdbRating: 7.5 }),
					film({ contentId: "tt2", contentType: "series", name: "Two" }),
				],
			}),
		);
		expect(items).toEqual([
			{
				id: "tt1",
				type: "movie",
				name: "One",
				poster: "p1",
				releaseInfo: "2020",
				imdbRating: 7.5,
			},
			{
				id: "tt2",
				type: "series",
				name: "Two",
				poster: undefined,
				releaseInfo: undefined,
				imdbRating: undefined,
			},
		]);
	});

	it("degrades to an empty list when the read fails", async () => {
		expect(await pullLibraryItems(data({ library: failing }))).toEqual([]);
	});
});

describe("pullLibraryProgress", () => {
	it("keeps only incomplete rows, furthest fraction per title", async () => {
		const row = (contentId: string, position: number, duration = 100) =>
			({ contentId, position, duration }) as ProgressRecord;
		const progress = async () => [
			row("a", 30), // 0.30 keep
			row("a", 55), // 0.55 wins
			row("b", 95), // 0.95 drop (>=0.9)
			row("c", 1), // 0.01 drop (<=0.02)
			row("d", 10, 0), // no duration drop
		];
		expect(await pullLibraryProgress(data({ progress }))).toEqual({ a: 0.55 });
	});

	it("degrades to {} on failure", async () => {
		expect(await pullLibraryProgress(data({ progress: failing }))).toEqual({});
	});
});
