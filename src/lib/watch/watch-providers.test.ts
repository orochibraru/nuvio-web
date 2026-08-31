import { describe, expect, it } from "vitest";
import {
	type JwNode,
	pickNode,
	regionFromAcceptLanguage,
	shapeProviders,
} from "./watch-providers.js";

const reacher: JwNode = {
	content: {
		title: "Reacher",
		originalReleaseYear: 2022,
		fullPath: "/us/tv-show/jack-reacher",
		externalIds: { imdbId: "tt9288030" },
	},
	offers: [
		{
			monetizationType: "FLATRATE",
			standardWebURL: "https://watch.amazon.com/detail?gti=a",
			package: {
				clearName: "Amazon Prime Video",
				technicalName: "amazonprimevideo",
				icon: "/icon/322992749/{profile}/amazonprime.{format}",
			},
		},
		{
			monetizationType: "FLATRATE",
			standardWebURL: "https://watch.amazon.com/detail?gti=a",
			package: { clearName: "Amazon Prime Video", technicalName: "x" },
		},
		{
			monetizationType: "ADS",
			standardWebURL: "https://watch.amazon.com/detail?gti=a",
			package: { clearName: "Amazon Prime Video with Ads", technicalName: "y" },
		},
		{
			monetizationType: "BUY",
			standardWebURL: "https://tv.apple.com/x",
			package: { clearName: "Apple TV", technicalName: "itunes" },
		},
		{
			monetizationType: "LINEAR_FLATRATE",
			package: { clearName: "Philo Live" },
		},
	],
};

describe("regionFromAcceptLanguage", () => {
	it("reads the region subtag", () => {
		expect(regionFromAcceptLanguage("en-US,en;q=0.9")).toBe("US");
		expect(regionFromAcceptLanguage("fr-FR,fr;q=0.8,en;q=0.5")).toBe("FR");
	});
	it("falls back when there is none", () => {
		expect(regionFromAcceptLanguage(null)).toBe("US");
		expect(regionFromAcceptLanguage("en")).toBe("US");
		expect(regionFromAcceptLanguage("en", "GB")).toBe("GB");
	});
});

describe("pickNode", () => {
	const other: JwNode = {
		content: { title: "Reacher", originalReleaseYear: 1999, externalIds: null },
	};
	it("prefers an IMDb id hit", () => {
		expect(
			pickNode([other, reacher], { imdbId: "tt9288030", title: "Reacher" }),
		).toBe(reacher);
	});
	it("falls back to an exact title + year match", () => {
		expect(pickNode([other, reacher], { title: "reacher", year: 2022 })).toBe(
			reacher,
		);
	});
	it("returns null when an IMDb id was given but nothing matched", () => {
		expect(
			pickNode([other], { imdbId: "tt0000001", title: "Nope" }),
		).toBeNull();
	});
});

describe("shapeProviders", () => {
	it("dedupes by provider and buckets by monetization", () => {
		const shaped = shapeProviders(reacher);
		expect(shaped.network).toBe("Amazon Prime Video");
		expect(shaped.stream).toHaveLength(1);
		expect(shaped.stream[0].icon).toBe(
			"https://images.justwatch.com/icon/322992749/s100/amazonprime.webp",
		);
		expect(shaped.buy.map((o) => o.provider)).toEqual(["Apple TV"]);
		expect(shaped.rent).toHaveLength(0);
		expect(shaped.justWatchUrl).toBe(
			"https://www.justwatch.com/us/tv-show/jack-reacher",
		);
	});
	it("is empty for a null node", () => {
		expect(shapeProviders(null).network).toBeNull();
	});
});
