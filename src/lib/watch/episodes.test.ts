import { describe, expect, it } from "vitest";
import type { Meta } from "$lib/addons/index.js";
import { nextEpisode } from "./episodes.ts";

const videos = [
	{ id: "x:1:1", title: "a", season: 1, episode: 1 },
	{ id: "x:1:2", title: "b", season: 1, episode: 2 },
	{ id: "x:2:1", title: "c", season: 2, episode: 1 },
	{ id: "x:0:1", title: "special", season: 0, episode: 1 },
] as NonNullable<Meta["videos"]>;

describe("nextEpisode", () => {
	it("returns the next episode within a season", () => {
		expect(nextEpisode(videos, 1, 1)).toEqual({ season: 1, episode: 2 });
	});

	it("rolls over to the next season", () => {
		expect(nextEpisode(videos, 1, 2)).toEqual({ season: 2, episode: 1 });
	});

	it("returns null for the last episode", () => {
		expect(nextEpisode(videos, 2, 1)).toBeNull();
	});

	it("returns null for a movie / missing coordinates / no videos", () => {
		expect(nextEpisode(videos, null, null)).toBeNull();
		expect(nextEpisode(undefined, 1, 1)).toBeNull();
	});

	it("ignores season 0 specials", () => {
		// s1e2 -> s2e1, never the special
		expect(nextEpisode(videos, 1, 2)).toEqual({ season: 2, episode: 1 });
	});
});
