/**
 * Intro / outro (credits) timestamps for the player's skip / next-episode
 * affordances, sourced from TheIntroDB (https://theintrodb.org).
 */

export const INTRODB_BASE = "https://api.theintrodb.org/v3";

/** One media item's usable segments, in **seconds** (to match `video.currentTime`). */
export interface MediaSegments {
	/** Intro / opening titles — `[start, end]`. `start` is 0 when it opens the episode. */
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
	if (lookup.tmdbId !== undefined) {
		params.set("tmdb_id", String(lookup.tmdbId));
	} else {
		params.set("imdb_id", lookup.imdbId);
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
