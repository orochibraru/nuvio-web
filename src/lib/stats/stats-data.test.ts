import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	progressPull: vi.fn(),
	historyPull: vi.fn(),
	getMeta: vi.fn(),
};

import type { ProfileData } from "#lib/userdata/types.js";
import { pullWatchStats } from "./stats-data.ts";

function data(): ProfileData {
	return {
		library: async () => [],
		progress: () => state.progressPull(),
		history: () => state.historyPull(),
	};
}

const lookup = () => async (_type: string, id: string) =>
	(await state.getMeta(_type, id))?.meta ?? null;

beforeEach(() => {
	state.progressPull = vi.fn(async () => []);
	state.historyPull = vi.fn(async () => []);
	state.getMeta = vi.fn(async () => null);
});

describe("pullWatchStats", () => {
	it("returns a zeroed report with no data", async () => {
		expect(await pullWatchStats(data(), lookup())).toMatchObject({
			movieMinutes: 0,
			seriesMinutes: 0,
			movieCount: 0,
			seriesCount: 0,
			episodeCount: 0,
			preferredFormat: null,
			topGenres: [],
		});
	});

	it("sums watch time by format, clamping position to duration", async () => {
		state.progressPull = vi.fn(async () => [
			{ contentType: "movie", position: 3_600_000, duration: 3_600_000 },
			{ contentType: "movie", position: 9_999_999, duration: 600_000 },
			{ contentType: "series", position: 1_200_000, duration: 1_800_000 },
		]);

		const out = await pullWatchStats(data(), lookup());
		expect(out.movieMinutes).toBe(70); // 60 + 10 (clamped)
		expect(out.seriesMinutes).toBe(20);
		expect(out.preferredFormat).toBe("movie");
	});

	it("counts unique titles + episodes from history and tallies genres", async () => {
		state.historyPull = vi.fn(async () => [
			{ contentType: "movie", contentId: "m1" },
			{ contentType: "movie", contentId: "m1" },
			{ contentType: "series", contentId: "s1" },
			{ contentType: "series", contentId: "s1" },
		]);
		state.getMeta = vi.fn(async (_type: string, id: string) => ({
			meta: { genres: id === "s1" ? ["Drama", "Crime"] : ["Drama"] },
		}));

		const out = await pullWatchStats(data(), lookup());
		expect(out.movieCount).toBe(1);
		expect(out.seriesCount).toBe(1);
		expect(out.episodeCount).toBe(2);
		expect(out.topGenres[0]).toEqual({ name: "Drama", count: 2 });
		expect(out.topGenres).toContainEqual({ name: "Crime", count: 1 });
		// de-duped to unique titles before the getMeta fan-out
		expect(state.getMeta).toHaveBeenCalledTimes(2);
	});

	it("skips genres for a title whose meta lookup fails", async () => {
		state.historyPull = vi.fn(async () => [
			{ contentType: "movie", contentId: "m1" },
		]);
		const failing = async () => {
			throw new Error("addon down");
		};
		const out = await pullWatchStats(data(), failing);
		expect(out.movieCount).toBe(1);
		expect(out.topGenres).toEqual([]);
	});

	it("survives both pulls failing", async () => {
		state.progressPull = vi.fn(async () => {
			throw new Error("x");
		});
		state.historyPull = vi.fn(async () => {
			throw new Error("y");
		});
		expect(await pullWatchStats(data(), lookup())).toMatchObject({
			movieMinutes: 0,
		});
	});
});
