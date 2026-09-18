import { TtlCache } from "#lib/addons/cache.js";
import type { UpcomingEpisode } from "./episodes.ts";

/**
 * When a series' next episode airs, from TVmaze (https://www.tvmaze.com/api),
 * for the case the addon's own meta cannot answer: it lists nothing past the
 * last aired episode. (When it does list an unaired one with a date,
 * `upcomingEpisode` / `nextToAir` answer from the meta and this is never
 * asked.)
 *
 * Keyless. TVmaze looks shows up by IMDb id (or TVDB / TVRage, which Nuvio ids
 * never are), so a `tmdb:` or `kitsu:` series gets no date from here.
 */

export const TVMAZE_BASE = "https://api.tvmaze.com";
const TIMEOUT_MS = 5000;

// Schedules move, but not by the minute; TVmaze asks for caching and allows 20
// calls per 10 seconds per IP. Public data, safe to share across visitors.
const cache = new TtlCache<UpcomingEpisode | null>(6 * 60 * 60_000);

interface TvmazeShow {
	_links?: { nextepisode?: { href?: string } };
}

export interface TvmazeEpisode {
	season?: number;
	number?: number | null;
	name?: string | null;
	airstamp?: string | null;
}

/** A TVmaze episode → an `UpcomingEpisode`, or `null` when it is too vague. */
export function fromTvmazeEpisode(
	episode: TvmazeEpisode | null,
): UpcomingEpisode | null {
	if (
		!episode ||
		typeof episode.season !== "number" ||
		typeof episode.number !== "number" ||
		!episode.airstamp ||
		Number.isNaN(Date.parse(episode.airstamp))
	) {
		return null;
	}
	return {
		season: episode.season,
		episode: episode.number,
		// TVmaze spells an unnamed future episode "TBA"; say nothing instead.
		title: episode.name && episode.name !== "TBA" ? episode.name : null,
		airsAt: new Date(episode.airstamp).toISOString(),
	};
}

async function getJson<T>(
	url: string,
	fetchImpl: typeof fetch,
): Promise<T | null> {
	try {
		const response = await fetchImpl(url, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		return response.ok ? ((await response.json()) as T) : null;
	} catch {
		return null;
	}
}

/**
 * The show's next scheduled episode, or `null` (not an IMDb id, TVmaze does not
 * know the show, nothing is scheduled, or TVmaze could not be reached).
 */
export function nextAiring(
	contentId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEpisode | null> {
	if (!/^tt\d{7,8}$/.test(contentId)) {
		return Promise.resolve(null);
	}
	return cache.wrap(contentId, async () => {
		const show = await getJson<TvmazeShow>(
			`${TVMAZE_BASE}/lookup/shows?imdb=${contentId}`,
			fetchImpl,
		);
		const href = show?._links?.nextepisode?.href;
		if (!href?.startsWith(`${TVMAZE_BASE}/`)) {
			return null;
		}
		return fromTvmazeEpisode(await getJson<TvmazeEpisode>(href, fetchImpl));
	});
}

/**
 * The next episode after the one being watched, for a series whose meta has
 * run out: TVmaze's next airing, but only when it really is later than
 * `season`/`episode` (TVmaze and an addon can disagree on numbering, and a
 * "next" that is behind the viewer is not one).
 */
export async function upcomingAfter(
	contentId: string,
	season: number,
	episode: number,
	fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEpisode | null> {
	const next = await nextAiring(contentId, fetchImpl);
	if (!next) {
		return null;
	}
	const later =
		next.season > season || (next.season === season && next.episode > episode);
	return later ? next : null;
}
