import { describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "$lib/nuvio/index.js";
import { pullLibraryItems, pullLibraryProgress } from "./library-data.ts";

function client(over: Partial<NuvioClient>): NuvioClient {
	return over as NuvioClient;
}

describe("pullLibraryItems", () => {
	it("maps API rows to poster-card data", async () => {
		const nuvio = client({
			library: {
				pull: vi.fn().mockResolvedValue([
					{
						content_id: "tt1",
						content_type: "movie",
						name: "One",
						poster: "p1",
						release_info: "2020",
						imdb_rating: 7.5,
					},
					{
						content_id: "tt2",
						content_type: "series",
						name: "Two",
						poster: null,
						release_info: null,
						imdb_rating: null,
					},
				]),
			},
		} as unknown as NuvioClient);

		const items = await pullLibraryItems(nuvio, 1);
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

	it("degrades to an empty list when the pull rejects", async () => {
		const nuvio = client({
			library: { pull: vi.fn().mockRejectedValue(new Error("down")) },
		} as unknown as NuvioClient);
		expect(await pullLibraryItems(nuvio, 1)).toEqual([]);
	});
});

describe("pullLibraryProgress", () => {
	it("keeps only incomplete rows, furthest fraction per title", async () => {
		const nuvio = client({
			watchProgress: {
				pull: vi.fn().mockResolvedValue([
					{ content_id: "a", position: 30, duration: 100 }, // 0.30 keep
					{ content_id: "a", position: 55, duration: 100 }, // 0.55 wins
					{ content_id: "b", position: 95, duration: 100 }, // 0.95 drop (>=0.9)
					{ content_id: "c", position: 1, duration: 100 }, // 0.01 drop (<=0.02)
					{ content_id: "d", position: 10, duration: 0 }, // no duration drop
				]),
			},
		} as unknown as NuvioClient);

		expect(await pullLibraryProgress(nuvio, 1)).toEqual({ a: 0.55 });
	});

	it("degrades to {} on failure", async () => {
		const nuvio = client({
			watchProgress: { pull: vi.fn().mockRejectedValue(new Error("x")) },
		} as unknown as NuvioClient);
		expect(await pullLibraryProgress(nuvio, 1)).toEqual({});
	});
});
