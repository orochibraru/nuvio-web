import { describe, expect, it } from "vitest";
import { backdropSrcset, posterSrcset } from "./images.js";

describe("posterSrcset", () => {
	it("rewrites a TMDB poster url into width variants", () => {
		const result = posterSrcset("https://image.tmdb.org/t/p/w500/abc.jpg");
		expect(result?.srcset).toContain(
			"https://image.tmdb.org/t/p/w185/abc.jpg 185w",
		);
		expect(result?.srcset).toContain(
			"https://image.tmdb.org/t/p/w780/abc.jpg 780w",
		);
		expect(result?.sizes).toContain("11rem");
	});

	it("handles an `original` source segment", () => {
		expect(
			posterSrcset("https://image.tmdb.org/t/p/original/x.jpg")?.srcset,
		).toContain("/w342/x.jpg 342w");
	});

	it("returns null for non-TMDB or missing urls", () => {
		expect(posterSrcset("https://cdn.example/poster.jpg")).toBeNull();
		expect(posterSrcset(null)).toBeNull();
		expect(posterSrcset(undefined)).toBeNull();
	});
});

describe("backdropSrcset", () => {
	it("uses wide width variants and 100vw sizes", () => {
		const result = backdropSrcset("https://image.tmdb.org/t/p/w780/bd.jpg");
		expect(result?.srcset).toContain("/w1280/bd.jpg 1280w");
		expect(result?.sizes).toBe("100vw");
	});
});
