import type { Meta } from "#lib/addons/index.js";

type Videos = NonNullable<Meta["videos"]>;
type Video = Videos[number];

/** An episode that has not aired yet, and when it will. */
export interface UpcomingEpisode {
	season: number;
	episode: number;
	title: string | null;
	/** ISO timestamp. */
	airsAt: string;
}

/**
 * Whether an episode is out. No date means aired: most addons only date the
 * episodes they list, and a missing date on a listed episode is far more often
 * an old episode than a future one.
 */
export function isAired(
	released: string | null | undefined,
	now = Date.now(),
): boolean {
	if (!released) {
		return true;
	}
	const at = Date.parse(released);
	return Number.isNaN(at) || at <= now;
}

/** Real episodes (no season 0 / specials), in play order. */
function ordered(videos: Videos | undefined): Video[] {
	return (videos ?? [])
		.filter((entry) => (entry.season ?? 0) > 0 && (entry.episode ?? 0) > 0)
		.sort(
			(a, b) =>
				(a.season ?? 0) - (b.season ?? 0) ||
				(a.episode ?? 0) - (b.episode ?? 0),
		);
}

function following(
	videos: Videos | undefined,
	season: number | null,
	episode: number | null,
): Video | undefined {
	if (season == null || episode == null) {
		return undefined;
	}
	const list = ordered(videos);
	const index = list.findIndex(
		(entry) => entry.season === season && entry.episode === episode,
	);
	return index >= 0 ? list[index + 1] : undefined;
}

/**
 * The episode immediately after `season`/`episode` in play order, **if it has
 * aired**. `null` when it's the last one, when the next one isn't out yet (see
 * {@link upcomingEpisode}), or when the input isn't an episode.
 *
 * Aired-only because the callers act on it: "Up next" auto-plays it and
 * Continue Watching rolls forward to it, and an episode that has not aired has
 * no streams to play.
 */
export function nextEpisode(
	videos: Videos | undefined,
	season: number | null,
	episode: number | null,
	now = Date.now(),
): { season: number; episode: number } | null {
	const candidate = following(videos, season, episode);
	return candidate && isAired(candidate.released, now)
		? { season: candidate.season ?? 0, episode: candidate.episode ?? 0 }
		: null;
}

function toUpcoming(entry: Video): UpcomingEpisode {
	return {
		season: entry.season ?? 0,
		episode: entry.episode ?? 0,
		title: entry.title ?? null,
		airsAt: new Date(entry.released as string).toISOString(),
	};
}

/** The episode after `season`/`episode` when the addon lists it but it has not aired. */
export function upcomingEpisode(
	videos: Videos | undefined,
	season: number | null,
	episode: number | null,
	now = Date.now(),
): UpcomingEpisode | null {
	const candidate = following(videos, season, episode);
	return candidate && !isAired(candidate.released, now)
		? toUpcoming(candidate)
		: null;
}

/** The first episode of the series that has not aired, for the detail page. */
export function nextToAir(
	videos: Videos | undefined,
	now = Date.now(),
): UpcomingEpisode | null {
	const candidate = ordered(videos).find(
		(entry) => !isAired(entry.released, now),
	);
	return candidate ? toUpcoming(candidate) : null;
}

const DAY_MS = 86_400_000;

/**
 * "Airs today" / "Airs tomorrow" / "Airs Sun, Sep 28" / "Airs Sep 28, 2027".
 * Calendar days in the viewer's time zone, not 24-hour spans, so an episode
 * airing at 02:00 tomorrow reads "tomorrow" at 23:00 tonight. The year only
 * shows when it isn't this one.
 */
export function airDateLabel(
	airsAt: string,
	now = Date.now(),
	locale?: string,
	timeZone?: string,
): string {
	const dayOf = (at: number) =>
		new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(at);
	const at = Date.parse(airsAt);
	const days = Math.round(
		(Date.parse(dayOf(at)) - Date.parse(dayOf(now))) / DAY_MS,
	);
	if (days <= 0) {
		return "Airs today";
	}
	if (days === 1) {
		return "Airs tomorrow";
	}
	const sameYear =
		new Date(at).getUTCFullYear() === new Date(now).getUTCFullYear();
	const date = new Intl.DateTimeFormat(locale, {
		timeZone,
		...(days < 7 ? { weekday: "short" } : {}),
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(at);
	return `Airs ${date}`;
}

/** "S38E1", plus " · Title" when the title is known. */
export function episodeLabel(upcoming: UpcomingEpisode): string {
	const code = `S${upcoming.season}E${upcoming.episode}`;
	return upcoming.title ? `${code} · ${upcoming.title}` : code;
}
