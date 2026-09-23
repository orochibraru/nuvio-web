import type { Meta, MetaVideo } from "#lib/addons/index.js";
import { m } from "#lib/i18n/index.js";
import { isAired, upcomingEpisode } from "./episodes.ts";

/**
 * A namespace prefix on a content id: `tmdb:1396`, `kitsu:46474`, `mal:52991`.
 * IMDb ids carry no prefix (`tt0903747`), so the id is the first segment.
 */
const NAMESPACED_ID = /^[a-z]+$/i;

/**
 * A video id → the title it belongs to, plus season / episode for a series.
 *
 * Addons spell episode ids three ways, and the content id is not always the
 * first `:` segment:
 *
 * - `tt0903747:2:5` : IMDb, season 2 episode 5.
 * - `tmdb:1396:2:5` : namespaced, same shape after the two-part content id.
 * - `kitsu:46474:5` : namespaced with an absolute episode and no season. The
 *   Kitsu addon lists those videos as `season: 1`, so that is what they parse
 *   to, and a progress key built from the id matches one built from the meta.
 *
 * Taking segment 0 as the content id, as this used to, read `tmdb:1396:2:5` as
 * content `tmdb`, season 1396, which broke progress keys, detail links and
 * segment lookups for every namespaced series.
 */
export function parseVideoId(
	type: string,
	id: string,
): {
	contentId: string;
	season: number | undefined;
	episode: number | undefined;
} {
	const parts = id.split(":");
	const namespaced = parts.length > 1 && NAMESPACED_ID.test(parts[0]);
	const idParts = namespaced ? 2 : 1;
	const contentId = parts.slice(0, idParts).join(":");
	if (type !== "series") {
		return { contentId: id, season: undefined, episode: undefined };
	}
	const rest = parts.slice(idParts).map(Number);
	if (rest.length >= 2) {
		return { contentId, season: rest[0], episode: rest[1] };
	}
	if (rest.length === 1) {
		return { contentId, season: 1, episode: rest[0] };
	}
	return { contentId, season: undefined, episode: undefined };
}

/** The server-side progress-key format: `contentId` or `contentId_s{S}e{E}`. */
export function progressKey(
	contentId: string,
	season?: number,
	episode?: number,
): string {
	return season != null && episode != null
		? `${contentId}_s${season}e${episode}`
		: contentId;
}

/**
 * Play-order episodes, sorted by season then episode. Real seasons only (S0
 * specials are out), numbered episodes only, one video per `SxEy`: a video
 * with no `episode` sorted as E0 and a duplicate `SxEy` both used to land
 * *before* the real episode, so finishing one made the CTA read "Continue"
 * for the episode it was a copy of.
 */
export function playOrder(videos: MetaVideo[] | undefined): MetaVideo[] {
	if (!videos) {
		return [];
	}
	const seen = new Set<string>();
	return [...videos]
		.filter((entry) => {
			if ((entry.season ?? 0) <= 0 || entry.episode == null) {
				return false;
			}
			const key = `${entry.season}:${entry.episode}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		})
		.sort(
			(a, b) =>
				(a.season ?? 0) - (b.season ?? 0) ||
				(a.episode ?? 0) - (b.episode ?? 0),
		);
}

export type TitleProgress = Record<
	string,
	{ fraction: number; completed: boolean }
>;

/** The fields of a progress row (sync record or mapped API row) matching needs. */
export interface ProgressLike {
	contentId: string;
	videoId: string;
	season: number | null;
	episode: number | null;
	position: number;
	duration: number;
}

/**
 * One title's progress, keyed by the id the page renders : the URL id for a
 * movie, the meta's video id for each episode.
 *
 * Rows are written under two content ids: the detail page marks episodes with
 * the URL id (`tt0903747`), the player saves with the id parsed from the
 * episode id (`tmdb:1396` when the addon's videos are `tmdb:1396:1:2`). Both
 * count, and an episode row matches a video by exact video id or, failing
 * that, by `(season, episode)` : each side normalised through `parseVideoId`
 * so `kitsu:46474:5` (S1E5) lines up with a meta video at season 1 episode 5.
 * When two rows land on one video, the furthest one wins.
 */
export function titleProgressFor(
	rows: readonly ProgressLike[],
	type: string,
	id: string,
	videos: readonly MetaVideo[] | undefined,
): TitleProgress {
	const out: TitleProgress = {};
	for (const { row, targets } of matchRows(rows, type, id, videos)) {
		const entry = progressEntry(row);
		for (const target of targets) {
			if (further(entry, out[target])) {
				out[target] = entry;
			}
		}
	}
	return out;
}

/**
 * The row to resume one video from, whichever way it was keyed : the same
 * matching as `titleProgressFor`, narrowed to this video. A row under the
 * player's own progress key wins; otherwise the furthest matching row does
 * (an episode marked from the detail page under the URL id, or saved by the
 * player from a differently spelled episode id). Feed it to `resumePoint`.
 */
export function resumeRowFor<T extends ProgressLike>(
	rows: readonly T[],
	type: string,
	videoId: string,
): T | null {
	const { contentId, season, episode } = parseVideoId(type, videoId);
	const key = progressKey(contentId, season, episode);
	const video = { id: videoId, title: "", season, episode };
	let best: T | null = null;
	for (const { row, targets } of matchRows(rows, type, contentId, [video])) {
		if (targets.length === 0) {
			continue;
		}
		const rowKey = progressKey(
			row.contentId,
			row.season ?? undefined,
			row.episode ?? undefined,
		);
		if (rowKey === key) {
			return row;
		}
		if (!best || further(progressEntry(row), progressEntry(best))) {
			best = row;
		}
	}
	return best;
}
/** Every usable row of this title, with the ids it counts for : the URL id for
 *  a movie, the matching meta videos for a series episode (possibly none). */
function matchRows<T extends ProgressLike>(
	rows: readonly T[],
	type: string,
	id: string,
	videos: readonly MetaVideo[] | undefined,
): { row: T; targets: string[] }[] {
	const series = type === "series";
	const index = indexVideos(type, series ? (videos ?? []) : []);
	index.contentIds.add(id).add(parseVideoId(type, id).contentId);
	return rows.flatMap((row) => {
		const parsed = parseVideoId(type, row.videoId);
		const ours =
			index.contentIds.has(row.contentId) ||
			index.contentIds.has(parsed.contentId);
		if (row.duration <= 0 || !ours) {
			return [];
		}
		return [{ row, targets: series ? rowTargets(row, parsed, index) : [id] }];
	});
}

const slotKey = (
	season: number | null | undefined,
	episode: number | null | undefined,
) => (season != null && episode != null ? `${season}:${episode}` : null);

type VideoIndex = ReturnType<typeof indexVideos>;

/** Content ids the videos live under, `SxEy` → every video listed there, and
 *  each video's own `SxEy`s (meta fields and its parsed id). */
function indexVideos(type: string, videos: readonly MetaVideo[]) {
	const contentIds = new Set<string>();
	const bySlot = new Map<string, string[]>();
	const slotsOf = new Map<string, (string | null)[]>();
	for (const video of videos) {
		const parsed = parseVideoId(type, video.id);
		contentIds.add(parsed.contentId);
		const slots = [
			slotKey(video.season, video.episode),
			slotKey(parsed.season, parsed.episode),
		];
		slotsOf.set(video.id, slots);
		for (const key of new Set(slots)) {
			if (key) {
				bySlot.set(key, [...(bySlot.get(key) ?? []), video.id]);
			}
		}
	}
	return { contentIds, bySlot, slotsOf };
}

/** The videos a row counts for: its own video when the meta lists that id, plus
 *  every video at the same `SxEy` (duplicates, or a differently spelled id). */
function rowTargets(
	row: ProgressLike,
	parsed: ReturnType<typeof parseVideoId>,
	index: VideoIndex,
): string[] {
	const own = index.slotsOf.get(row.videoId);
	const slots = own ?? [
		slotKey(row.season ?? parsed.season, row.episode ?? parsed.episode),
	];
	return [
		...new Set([
			...(own ? [row.videoId] : []),
			...slots.flatMap((key) => (key && index.bySlot.get(key)) || []),
		]),
	];
}

/** Completed past 90% of a long-enough duration (a short clip never is). */
function progressEntry(
	row: Pick<ProgressLike, "position" | "duration">,
): TitleProgress[string] {
	const fraction = Math.min(1, row.position / row.duration);
	return { fraction, completed: fraction >= 0.9 && row.duration >= 60_000 };
}

/** Completed beats not; otherwise the further position wins. */
function further(
	entry: TitleProgress[string],
	prev: TitleProgress[string] | undefined,
): boolean {
	if (!prev) {
		return true;
	}
	return entry.completed === prev.completed
		? entry.fraction > prev.fraction
		: entry.completed;
}

/**
 * The series CTA target. Priority: an episode actually mid-watch → the episode
 * after the furthest one finished (in play order) → `null` (the page falls to
 * "Play" the first episode).
 */
export function resumeTarget(
	orderedEpisodes: readonly MetaVideo[],
	progress: TitleProgress,
): { id: string; label: string } | null {
	const tag = (episode: { season?: number; episode?: number }) =>
		`S${episode.season ?? 1}E${episode.episode ?? 1}`;

	const inProgress = orderedEpisodes.find((episode) => {
		const p = progress[episode.id];
		return p && !p.completed && p.fraction > 0.02;
	});
	if (inProgress) {
		return {
			id: inProgress.id,
			label: m.watch_resume_episode({ episode: tag(inProgress) }),
		};
	}

	let lastFinished = -1;
	orderedEpisodes.forEach((episode, index) => {
		if (progress[episode.id]?.completed) {
			lastFinished = index;
		}
	});
	const upNext = orderedEpisodes[lastFinished + 1];
	if (lastFinished >= 0 && upNext) {
		return {
			id: upNext.id,
			label: m.watch_continue_episode({ episode: tag(upNext) }),
		};
	}
	return null;
}

export function episodeRow(entry: MetaVideo) {
	return {
		videoId: entry.id,
		season: entry.season ?? 0,
		episode: entry.episode ?? 0,
		title: entry.title,
		overview: entry.overview ?? null,
		thumbnail: entry.thumbnail ?? null,
		released: entry.released ?? null,
		rating: entry.rating ?? null,
	};
}

/** The episode being watched, if `meta` carries a matching video. */
export function currentVideo(
	meta: Meta | undefined,
	videoId: string,
	season: number,
	episode: number,
): MetaVideo | undefined {
	return meta?.videos?.find(
		(entry) =>
			entry.id === videoId ||
			(entry.season === season && entry.episode === episode),
	);
}

/**
 * The "Up next" card. `null` when this is the last episode **or the next one
 * has not aired**: the card auto-plays after a countdown, and an unaired
 * episode has no streams. The unaired one surfaces as `upcoming` instead.
 */
export function nextCard(
	ordered: MetaVideo[],
	season: number,
	episode: number,
	now = Date.now(),
) {
	const index = ordered.findIndex(
		(entry) => entry.season === season && entry.episode === episode,
	);
	const candidate = index >= 0 ? ordered[index + 1] : undefined;
	return candidate && isAired(candidate.released, now)
		? {
				videoId: candidate.id,
				label: `S${candidate.season}E${candidate.episode} · ${candidate.title}`,
				thumbnail: candidate.thumbnail ?? null,
			}
		: null;
}

/** Everything the in-player info overlay shows : so it never re-fetches meta. */
export function overlayInfo(
	meta: Meta | undefined,
	episode: { title: string | null; overview: string | null },
) {
	return {
		description: meta?.description ?? null,
		imdbRating:
			typeof meta?.imdbRating === "number"
				? meta.imdbRating.toFixed(1)
				: (meta?.imdbRating ?? null),
		releaseInfo: meta?.releaseInfo ?? null,
		runtime: meta?.runtime ?? null,
		status: meta?.status ?? null,
		country: meta?.country ?? null,
		awards: meta?.awards ?? null,
		cast: meta?.cast?.slice(0, 8) ?? [],
		director: meta?.director?.slice(0, 3) ?? [],
		writer: meta?.writer?.slice(0, 3) ?? [],
		episodeTitle: episode.title,
		episodeOverview: episode.overview,
	};
}

/** Hero-strip presentation fields, all defaulted so the page never sees holes. */
export function heroFields(meta: Meta | undefined) {
	return {
		background: meta?.background ?? null,
		poster: meta?.poster ?? null,
		logo: meta?.logo ?? null,
		certification:
			meta?.certification ??
			(meta?.behaviorHints?.adult ? "18+" : null) ??
			null,
		genres: meta?.genres ?? [],
	};
}

/**
 * A resume marker only once there's a real position into a known duration,
 * and not for a finished one (a "mark watched" row sits at its very end):
 * that plays from the start.
 */
export function resumePoint(
	progress: { duration: number; position: number } | null,
) {
	if (!(progress && progress.duration > 0 && progress.position > 5000)) {
		return null;
	}
	if (progressEntry(progress).completed) {
		return null;
	}
	return { position: progress.position, duration: progress.duration };
}

/**
 * Assemble the player / source-drawer payload from a title's meta. Pure : the
 * load and the `playbackMeta` query own the I/O.
 */
export function assemblePlaybackContext(input: {
	type: string;
	id: string;
	meta: Meta | undefined;
}) {
	const { type, id, meta } = input;
	const { contentId, season, episode } = parseVideoId(type, id);
	const metaType: "movie" | "series" = type === "series" ? "series" : "movie";
	const isEpisode = type === "series" && season != null && episode != null;
	const video = isEpisode ? currentVideo(meta, id, season, episode) : undefined;
	const subheading = isEpisode
		? `S${season}E${episode}${video ? ` · ${video.title}` : ""}`
		: null;

	const ordered = type === "series" ? playOrder(meta?.videos) : [];

	return {
		metaType,
		contentId,
		season: season ?? null,
		episode: episode ?? null,
		videoId: id,
		heading: meta?.name ?? contentId,
		subheading,
		...heroFields(meta),
		info: overlayInfo(meta, {
			title: video?.title ?? null,
			overview: video?.overview ?? null,
		}),
		episodes: ordered.map(episodeRow),
		next: isEpisode ? nextCard(ordered, season, episode) : null,
		upcoming: isEpisode ? upcomingEpisode(meta?.videos, season, episode) : null,
	};
}
