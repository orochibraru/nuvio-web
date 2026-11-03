import type { Meta } from "#lib/addons/index.js";
import { getLocale, m } from "#lib/i18n/index.js";
import type { UpcomingEpisode } from "#lib/watch/episodes.js";

type Videos = NonNullable<Meta["videos"]>;

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;

export interface CalendarEntry extends UpcomingEpisode {
	id: string;
	name: string;
	poster: string | null;
}

export interface CalendarDay {
	key: string;
	label: string;
	entries: CalendarEntry[];
}

// Dated episodes from the last week onwards, plus the schedule's next airing when the meta does not list it.
export function seriesEpisodes(
	videos: Videos | undefined,
	next: UpcomingEpisode | null,
	now = Date.now(),
): UpcomingEpisode[] {
	const since = now - RECENT_DAYS * DAY_MS;
	const episodes: UpcomingEpisode[] = [];
	for (const video of videos ?? []) {
		const at = video.released ? Date.parse(video.released) : Number.NaN;
		if (
			(video.season ?? 0) > 0 &&
			(video.episode ?? 0) > 0 &&
			at >= since &&
			!episodes.some(
				(known) =>
					known.season === video.season && known.episode === video.episode,
			)
		) {
			episodes.push({
				season: video.season ?? 0,
				episode: video.episode ?? 0,
				title: video.title?.trim() || null,
				airsAt: new Date(at).toISOString(),
			});
		}
	}
	if (
		next &&
		Date.parse(next.airsAt) >= since &&
		!episodes.some(
			(known) => known.season === next.season && known.episode === next.episode,
		)
	) {
		episodes.push(next);
	}
	return episodes;
}

// Whether an episode came out in the last week that none of the watched video ids covers.
export function hasNewEpisode(
	videos: Videos | undefined,
	watched: ReadonlySet<string>,
	now = Date.now(),
): boolean {
	const since = now - RECENT_DAYS * DAY_MS;
	return (videos ?? []).some((video) => {
		const at = video.released ? Date.parse(video.released) : Number.NaN;
		return (
			(video.season ?? 0) > 0 &&
			(video.episode ?? 0) > 0 &&
			at >= since &&
			at <= now &&
			!watched.has(video.id)
		);
	});
}

function dayKey(at: number, timeZone?: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}

export function dayLabel(
	key: string,
	now = Date.now(),
	locale: string = getLocale(),
	timeZone?: string,
): string {
	const days = Math.round(
		(Date.parse(key) - Date.parse(dayKey(now, timeZone))) / DAY_MS,
	);
	if (days === 0) {
		return m.calendar_today();
	}
	if (days === 1) {
		return m.calendar_tomorrow();
	}
	if (days === -1) {
		return m.calendar_yesterday();
	}
	const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		weekday: "long",
		month: "long",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(Date.parse(key));
}

// Calendar days in the viewer's time zone: today onwards first, then the past week newest first.
export function groupByDay(
	entries: readonly CalendarEntry[],
	now = Date.now(),
	locale: string = getLocale(),
	timeZone?: string,
): { upcoming: CalendarDay[]; recent: CalendarDay[] } {
	const today = dayKey(now, timeZone);
	const days = new Map<string, CalendarEntry[]>();
	const sorted = [...entries].sort(
		(a, b) =>
			Date.parse(a.airsAt) - Date.parse(b.airsAt) ||
			a.name.localeCompare(b.name) ||
			a.season - b.season ||
			a.episode - b.episode,
	);
	for (const entry of sorted) {
		const key = dayKey(Date.parse(entry.airsAt), timeZone);
		days.set(key, [...(days.get(key) ?? []), entry]);
	}
	const all = [...days].map(([key, dayEntries]) => ({
		key,
		label: dayLabel(key, now, locale, timeZone),
		entries: dayEntries,
	}));
	return {
		upcoming: all.filter((day) => day.key >= today),
		recent: all.filter((day) => day.key < today).reverse(),
	};
}
