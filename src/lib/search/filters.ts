/**
 * The search page's filters. They narrow what the page already has (results
 * or the discovery rows), so nothing here costs an addon call. They live in
 * the URL (`?type=&genre=&released=&rating=`) like the library's.
 */

export const SEARCH_TYPES = ["all", "movie", "series"] as const;
export const SEARCH_RELEASES = [
	"any",
	"recent",
	"2010s",
	"2000s",
	"older",
] as const;
export const SEARCH_RATINGS = ["any", "6", "7", "8"] as const;

export interface SearchFilters {
	type: (typeof SEARCH_TYPES)[number];
	genre: string;
	released: (typeof SEARCH_RELEASES)[number];
	rating: (typeof SEARCH_RATINGS)[number];
}

interface Filterable {
	type: string;
	genres?: string[];
	releaseInfo?: string;
	imdbRating?: string | number;
}

function pick<T extends string>(options: readonly T[], raw: string | null): T {
	return options.find((option) => option === raw) ?? options[0];
}

export function searchFiltersFrom(params: {
	get: (name: string) => string | null;
}): SearchFilters {
	return {
		type: pick(SEARCH_TYPES, params.get("type")),
		genre: params.get("genre") ?? "",
		released: pick(SEARCH_RELEASES, params.get("released")),
		rating: pick(SEARCH_RATINGS, params.get("rating")),
	};
}

export function activeSearchFilters(filters: SearchFilters): number {
	return (
		Number(filters.type !== "all") +
		Number(filters.genre !== "") +
		Number(filters.released !== "any") +
		Number(filters.rating !== "any")
	);
}

function releaseYear(meta: Filterable): number | null {
	const year = Number.parseInt(meta.releaseInfo ?? "", 10);
	return Number.isFinite(year) ? year : null;
}

/** A title missing the field a filter asks about doesn't pass that filter. */
export function matchesSearchFilters(
	meta: Filterable,
	filters: SearchFilters,
	now = new Date(),
): boolean {
	if (filters.type !== "all" && meta.type !== filters.type) {
		return false;
	}
	if (filters.genre && !meta.genres?.includes(filters.genre)) {
		return false;
	}
	if (filters.released !== "any") {
		const year = releaseYear(meta);
		if (year === null) {
			return false;
		}
		const passes = {
			recent: year >= now.getFullYear() - 4,
			"2010s": year >= 2010 && year <= 2019,
			"2000s": year >= 2000 && year <= 2009,
			older: year < 2000,
		}[filters.released];
		if (!passes) {
			return false;
		}
	}
	if (filters.rating !== "any") {
		const rating = Number(meta.imdbRating);
		if (!(rating >= Number(filters.rating))) {
			return false;
		}
	}
	return true;
}

/** Every genre among `metas`, for the Genre filter's choices. */
export function genresOf(metas: readonly Filterable[]): string[] {
	return [...new Set(metas.flatMap((meta) => meta.genres ?? []))].sort((a, b) =>
		a.localeCompare(b),
	);
}
