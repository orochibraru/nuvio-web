/**
 * Intro / outro (credits) timestamps for the player's skip / next-episode
 * affordances, sourced from TheIntroDB (https://theintrodb.org).
 */

export const INTRODB_BASE = "https://api.theintrodb.org/v3";

/** One media item's usable segments, in **seconds** (to match `video.currentTime`). */
export interface MediaSegments {
	/** Intro / opening titles : `[start, end]`. `start` is 0 when it opens the episode. */
	intro: { start: number; end: number } | null;
	/** Where the end credits / outro begin. */
	credits: { start: number } | null;
}

export interface IntroDbSegment {
	start_ms: number | null;
	end_ms: number | null;
}

export interface IntroDbMedia {
	tmdb_id?: number;
	type?: string;
	season?: number | null;
	episode?: number | null;
	intro?: IntroDbSegment[];
	recap?: IntroDbSegment[];
	credits?: IntroDbSegment[];
	preview?: IntroDbSegment[];
}

export type SegmentLookup =
	| { tmdbId: number; imdbId?: undefined }
	| { imdbId: string; tmdbId?: undefined }
	| null;

/**
 * Turn a Stremio/Nuvio `content_id` into the id TheIntroDB wants. `tmdb:` ids
 * (and bare numbers) map to `tmdb_id`; `tt…` ids map to `imdb_id` (slower and
 * fuzzier server-side, but supported).
 */
export function segmentLookup(contentId: string): SegmentLookup {
	const trimmed = contentId.trim();
	const tmdbPrefixed = /^tmdb:(\d+)/i.exec(trimmed);
	// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
	if (tmdbPrefixed) {
		return { tmdbId: Number(tmdbPrefixed[1]) };
	}
	if (/^tt\d{7,8}$/.test(trimmed)) {
		return { imdbId: trimmed };
	}
	if (/^\d+$/.test(trimmed)) {
		return { tmdbId: Number(trimmed) };
	}
	return null;
}

/** Query string for `GET /v3/media`. `null` when the id can't be mapped. */
export function segmentQuery(
	contentId: string,
	season: number | null,
	episode: number | null,
): URLSearchParams | null {
	const lookup = segmentLookup(contentId);
	if (!lookup) {
		return null;
	}
	const params = new URLSearchParams();
	if (lookup.tmdbId === undefined) {
		params.set("imdb_id", lookup.imdbId);
	} else {
		params.set("tmdb_id", String(lookup.tmdbId));
	}
	if (season != null && episode != null) {
		params.set("season", String(season));
		params.set("episode", String(episode));
	}
	return params;
}

function firstSegment(
	list: IntroDbSegment[] | undefined,
): IntroDbSegment | null {
	return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

/**
 * Reduce a TheIntroDB response to the single intro + credits segment the player
 * uses (each entry is already a weighted community average). Ignores zero-length
 * "no segment" markers.
 */
export function normalizeSegments(media: IntroDbMedia | null): MediaSegments {
	const empty: MediaSegments = { intro: null, credits: null };
	if (!media) {
		return empty;
	}

	const introRaw = firstSegment(media.intro);
	const introEnd = introRaw?.end_ms ?? 0;
	const introStart = introRaw?.start_ms ?? 0;
	const intro =
		introEnd > introStart + 3000
			? { start: introStart / 1000, end: introEnd / 1000 }
			: null;

	const creditsRaw = firstSegment(media.credits);
	const credits =
		creditsRaw?.start_ms && creditsRaw.start_ms > 0
			? { start: creditsRaw.start_ms / 1000 }
			: null;

	return { intro, credits };
}

// -- AniSkip -------------------------------------------------------------------
//
// TheIntroDB is thin on anime; AniSkip (https://aniskip.com) is the community
// database for exactly that. It is keyed by MyAnimeList id, so a title's id goes
// through ARM (https://arm.haglund.dev), the anime id-mapping service, first.
// Neither needs a key.
//
// Anime detection is the mapping itself: ARM answers `[]` for anything that is
// not anime, so there is no heuristic to get wrong.

export const ANISKIP_BASE = "https://api.aniskip.com/v2";
export const ARM_BASE = "https://arm.haglund.dev/api/v2";

/** One ARM mapping entry : only the fields used here. */
export interface ArmEntry {
	myanimelist?: number | null;
	"themoviedb-season"?: number | null;
	"thetvdb-season"?: number | null;
}

/**
 * How to get from a content id to a MAL id.
 *
 * - `mal` : the id already is one.
 * - `ids` : ARM's single-entry lookup (Kitsu, AniList), one anime per id.
 * - `list` : ARM's per-season list (IMDb, TMDB), where one series id spans
 *   several MAL entries, one per season.
 */
export type AnimeLookup =
	| { kind: "mal"; malId: number }
	| { kind: "ids"; path: string }
	| { kind: "list"; path: string }
	| null;

export function animeLookup(contentId: string): AnimeLookup {
	const trimmed = contentId.trim();
	const namespaced = /^(mal|kitsu|anilist|tmdb):(\d+)$/i.exec(trimmed);
	// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
	if (namespaced) {
		const [, source, id] = namespaced;
		switch (source.toLowerCase()) {
			case "mal":
				return { kind: "mal", malId: Number(id) };
			case "tmdb":
				return { kind: "list", path: `themoviedb?id=${id}` };
			default:
				return {
					kind: "ids",
					path: `ids?source=${source.toLowerCase()}&id=${id}`,
				};
		}
	}
	if (/^tt\d{7,8}$/.test(trimmed)) {
		return { kind: "list", path: `imdb?id=${trimmed}` };
	}
	if (/^\d+$/.test(trimmed)) {
		return { kind: "list", path: `themoviedb?id=${trimmed}` };
	}
	return null;
}

/**
 * The MAL id for one season, out of an ARM response.
 *
 * A per-season list tags each entry with its TMDB (or TVDB) season. When no
 * entry carries the season asked for, a single-entry list is taken as-is (a
 * film, or a series ARM has not split); anything more is ambiguous and yields
 * nothing rather than skip times for the wrong season.
 */
export function pickMalId(
	response: ArmEntry | ArmEntry[] | null | undefined,
	season: number | null,
): number | null {
	if (!response) {
		return null;
	}
	const entries = (Array.isArray(response) ? response : [response]).filter(
		(entry) => typeof entry.myanimelist === "number",
	);
	if (season != null) {
		const match = entries.find(
			(entry) =>
				entry["themoviedb-season"] === season ||
				entry["thetvdb-season"] === season,
		);
		if (match) {
			return match.myanimelist ?? null;
		}
	}
	return entries.length === 1 ? (entries[0].myanimelist ?? null) : null;
}

/** `GET /skip-times/{malId}/{episode}` for openings and endings. */
export function aniSkipUrl(malId: number, episode: number | null): string {
	const params = new URLSearchParams();
	for (const type of ["op", "ed", "mixed-op", "mixed-ed"]) {
		params.append("types[]", type);
	}
	// 0 asks for every submission regardless of the length it was timed against.
	params.set("episodeLength", "0");
	return `${ANISKIP_BASE}/skip-times/${malId}/${episode ?? 1}?${params}`;
}

export interface AniSkipResponse {
	found?: boolean;
	results?: Array<{
		skipType?: string;
		interval?: { startTime?: number; endTime?: number };
	}>;
}

/** An AniSkip response → the player's intro + credits, in seconds. */
export function normalizeAniSkip(
	response: AniSkipResponse | null,
): MediaSegments {
	const results = response?.found ? (response.results ?? []) : [];
	const find = (types: string[]) =>
		results.find((entry) => types.includes(entry.skipType ?? ""))?.interval;

	const op = find(["op", "mixed-op"]);
	const opStart = op?.startTime ?? 0;
	const opEnd = op?.endTime ?? 0;
	const ed = find(["ed", "mixed-ed"]);

	return {
		intro: opEnd > opStart + 3 ? { start: opStart, end: opEnd } : null,
		credits: ed?.startTime && ed.startTime > 0 ? { start: ed.startTime } : null,
	};
}
