import { describe, expect, it } from "vitest";
import {
	activeSearchFilters,
	genresOf,
	matchesSearchFilters,
	searchFiltersFrom,
} from "./filters.ts";

const NOW = new Date("2026-10-22");
const heat = {
	type: "movie",
	genres: ["Crime", "Drama"],
	releaseInfo: "1995",
	imdbRating: "8.3",
};
const show = {
	type: "series",
	genres: ["Comedy"],
	releaseInfo: "2024–",
	imdbRating: 7.1,
};

describe("searchFiltersFrom", () => {
	it("falls back to no filter on junk", () => {
		const filters = searchFiltersFrom(
			new URLSearchParams("type=film&released=1990s&rating=11"),
		);
		expect(filters).toEqual({
			type: "all",
			genre: "",
			released: "any",
			rating: "any",
		});
		expect(activeSearchFilters(filters)).toBe(0);
	});
});

describe("matchesSearchFilters", () => {
	const filters = (query: string) =>
		searchFiltersFrom(new URLSearchParams(query));

	it("narrows by type, genre, release and rating", () => {
		expect(matchesSearchFilters(heat, filters("type=movie"), NOW)).toBe(true);
		expect(matchesSearchFilters(show, filters("type=movie"), NOW)).toBe(false);
		expect(matchesSearchFilters(heat, filters("genre=Crime"), NOW)).toBe(true);
		expect(matchesSearchFilters(show, filters("genre=Crime"), NOW)).toBe(false);
		expect(matchesSearchFilters(heat, filters("released=older"), NOW)).toBe(
			true,
		);
		expect(matchesSearchFilters(show, filters("released=recent"), NOW)).toBe(
			true,
		);
		expect(matchesSearchFilters(show, filters("rating=8"), NOW)).toBe(false);
		expect(matchesSearchFilters(heat, filters("rating=8"), NOW)).toBe(true);
	});

	it("drops a title that lacks the field a filter asks about", () => {
		expect(
			matchesSearchFilters({ type: "movie" }, filters("rating=6"), NOW),
		).toBe(false);
		expect(
			matchesSearchFilters({ type: "movie" }, filters("released=2010s"), NOW),
		).toBe(false);
	});
});

describe("genresOf", () => {
	it("lists each genre once, sorted", () => {
		expect(genresOf([heat, show, heat])).toEqual(["Comedy", "Crime", "Drama"]);
	});
});
