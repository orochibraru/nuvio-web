import type { Meta } from "#lib/addons/index.js";
import { pooledMap } from "#lib/core/pool.js";
import type { ProfileData } from "#lib/userdata/types.js";
import { nextEpisode, nextToAir, type UpcomingEpisode } from "./episodes.ts";
import {
	assemblePlaybackContext,
	type ProgressLike,
	parseVideoId,
	resumePoint,
	resumeRowFor,
} from "./playback-context.ts";
import { nextAiring, upcomingAfter } from "./schedule.ts";

// Each row fans out to every meta-providing addon inside `getMeta`; an
// unbounded pass over up to 16 rows could burst 30-50+ concurrent requests
// at a shared addon like Cinemeta, time some out, and leave those cards
// showing a bare content id for a name.
const CONTINUE_WATCHING_CONCURRENCY = 4;

/** Injected rather than imported so this module stays free of `$app/server`
 *  (and unit-testable) : the load passes `AddonClient`'s own lookup. */
export type MetaLookup = (type: string, id: string) => Promise<Meta | null>;

/** A continue-watching card before any addon meta is attached. */
export interface ResumeRow {
	id: string;
	type: "movie" | "series";
	name: string;
	poster: string | null;
	background: string | null;
	logo: string | null;
	videoId: string;
	season: number | null;
	episode: number | null;
	progress: number;
	remainingMs: number;
}

/**
 * The continue-watching row, fully resolved: in-progress rows joined to
 * addon meta (name / art) with a finished series episode rolled forward to
 * the next one. Called from the home load (streamed, not awaited) so the
 * cards arrive named rather than showing their raw content ids until a
 * client query lands.
 */
export async function pullContinueWatching(
	data: ProfileData,
	lookupMeta: MetaLookup,
): Promise<ResumeRow[]> {
	// A failed read must not blank the whole home page : the client sync
	// store still fills the row.
	const rows = (await data.progress().catch(() => [])).slice(0, 30);
	// Most-recent row per title (completed or not : a finished episode of a
	// running show still points at the next one to watch).
	const seen = new Set<string>();
	const latestPerTitle = rows
		.filter((row) => row.duration > 60_000)
		.sort((a, b) => b.lastWatched - a.lastWatched)
		.filter((row) => {
			if (seen.has(row.contentId)) {
				return false;
			}
			seen.add(row.contentId);
			return true;
		})
		.slice(0, 16);

	const items = (
		await pooledMap(
			latestPerTitle,
			// Each row itself fans out to every meta-providing addon inside
			// `getMeta` : an unbounded outer `Promise.all` over up to 16 rows
			// could burst 30-50+ concurrent requests at a shared addon like
			// Cinemeta, timing some out and silently falling back to the bare
			// content id as the "name" (`row.contentId` below). Capped like
			// `AddonClient`'s own internal fan-out.
			CONTINUE_WATCHING_CONCURRENCY,
			async (row) => {
				const meta = await lookupMeta(row.contentType, row.contentId).catch(
					() => null,
				);
				const base = {
					id: row.contentId,
					type: row.contentType,
					name: meta?.name ?? row.contentId,
					poster: meta?.poster ?? null,
					background: meta?.background ?? meta?.poster ?? null,
					logo: meta?.logo ?? null,
				};

				const complete = row.position >= row.duration * 0.9;

				// Still mid-episode → resume it.
				if (!complete) {
					return {
						...base,
						videoId: row.videoId,
						season: row.season,
						episode: row.episode,
						progress: row.position / row.duration,
						remainingMs: Math.max(0, row.duration - row.position),
					};
				}

				// Finished. For a series, roll forward to the next episode.
				if (row.contentType === "series" && meta?.videos) {
					const next = nextEpisode(meta.videos, row.season, row.episode);
					if (next) {
						return {
							...base,
							videoId: `${row.contentId}:${next.season}:${next.episode}`,
							season: next.season,
							episode: next.episode,
							progress: 0,
							remainingMs: 0,
						};
					}
				}

				// Finished movie, or last episode of the show : drop it.
				return null;
			},
		)
	).filter((item): item is NonNullable<typeof item> => item !== null);

	return items.slice(0, 12);
}

/**
 * The player's meta half : heading, art, episodes, what's next (resume is
 * `pullPlaybackResume`). Best-effort: a missing addon still yields a context
 * the player can paint.
 */
export async function pullPlaybackMeta(
	video: { type: string; id: string },
	lookupMeta: MetaLookup,
) {
	const { type, id } = video;
	const { contentId } = parseVideoId(type, id);
	const metaType: "movie" | "series" = type === "series" ? "series" : "movie";
	const meta = await lookupMeta(metaType, contentId).catch(() => null);
	return assemblePlaybackContext({ type, id, meta: meta ?? undefined });
}

/**
 * Where to resume this video, from the profile's progress rows, whichever id
 * they were saved under (see `resumeRowFor`). Its own promise so the player
 * load streams it separately from the meta: the resume seek must not wait on
 * the slowest meta addon.
 */
export async function pullPlaybackResume(
	data: ProfileData,
	video: { type: string; id: string },
) {
	const rows = await data.progress().catch(() => []);
	return resumePoint(resumeRowFor(rows, video.type, video.id));
}

/**
 * What airs after the episode being played, for the player's end panel.
 *
 * The meta answers when it lists the unaired episode (`context.upcoming`).
 * TVmaze is asked only when the meta has run out entirely : no aired next, no
 * unaired next : since that is the one case the addon cannot answer. Streamed
 * separately from the context in the load, so a slow schedule lookup never
 * holds up the player's heading.
 */
export async function pullUpcoming(
	context: {
		metaType: "movie" | "series";
		contentId: string;
		season: number | null;
		episode: number | null;
		next: unknown;
		upcoming: UpcomingEpisode | null;
	} | null,
	fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEpisode | null> {
	if (
		context?.metaType !== "series" ||
		context.season == null ||
		context.episode == null
	) {
		return null;
	}
	if (context.upcoming || context.next) {
		return context.upcoming;
	}
	return await upcomingAfter(
		context.contentId,
		context.season,
		context.episode,
		fetchImpl,
	);
}

/**
 * The series' next episode to air, for the detail page: the first unaired one
 * the meta lists, else TVmaze's next airing if it is past the last episode the
 * meta lists (when the two disagree, the addon's listing wins).
 */
export async function pullNextToAir(
	meta: Meta | null,
	fetchImpl: typeof fetch = fetch,
): Promise<UpcomingEpisode | null> {
	if (meta?.type !== "series") {
		return null;
	}
	const fromMeta = nextToAir(meta.videos);
	if (fromMeta) {
		return fromMeta;
	}
	const listed = (meta.videos ?? []).filter(
		(entry) => (entry.season ?? 0) > 0 && (entry.episode ?? 0) > 0,
	);
	const last = listed.reduce<(typeof listed)[number] | undefined>(
		(latest, entry) =>
			!latest ||
			(entry.season ?? 0) > (latest.season ?? 0) ||
			((entry.season ?? 0) === (latest.season ?? 0) &&
				(entry.episode ?? 0) > (latest.episode ?? 0))
				? entry
				: latest,
		undefined,
	);
	return last
		? await upcomingAfter(
				meta.id,
				last.season ?? 0,
				last.episode ?? 0,
				fetchImpl,
			)
		: await nextAiring(meta.id, fetchImpl);
}

/**
 * The profile's progress rows in the shape `titleProgressFor` matches on. The
 * detail load joins them to the meta's videos; the read is unfiltered because
 * a title's rows can sit under the URL id or an episode-derived id
 * (`tmdb:…`), which only the meta can tell apart.
 */
export function pullProgressRows(data: ProfileData): Promise<ProgressLike[]> {
	return data.progress();
}
