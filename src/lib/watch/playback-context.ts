import type { Meta, MetaVideo } from "#lib/addons/index.js";

/**
 * `tmdb:1396` (movie) or `tmdb:1396:2:5` (episode) → its parts. Non-series ids
 * carry no season / episode.
 */
export function parseVideoId(
	type: string,
	id: string,
): {
	contentId: string;
	season: number | undefined;
	episode: number | undefined;
} {
	if (type !== "series") {
		return { contentId: id, season: undefined, episode: undefined };
	}
	const parts = id.split(":");
	return {
		contentId: parts[0] ?? id,
		season: parts[1] ? Number(parts[1]) : undefined,
		episode: parts[2] ? Number(parts[2]) : undefined,
	};
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

/** Play-order episodes (real seasons only), sorted by season then episode. */
export function playOrder(videos: MetaVideo[] | undefined): MetaVideo[] {
	if (!videos) {
		return [];
	}
	return [...videos]
		.filter((entry) => (entry.season ?? 0) > 0)
		.sort(
			(a, b) =>
				(a.season ?? 0) - (b.season ?? 0) ||
				(a.episode ?? 0) - (b.episode ?? 0),
		);
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

export function nextCard(
	ordered: MetaVideo[],
	season: number,
	episode: number,
) {
	const index = ordered.findIndex(
		(entry) => entry.season === season && entry.episode === episode,
	);
	const candidate = index >= 0 ? ordered[index + 1] : undefined;
	return candidate
		? {
				videoId: candidate.id,
				label: `S${candidate.season}E${candidate.episode} · ${candidate.title}`,
				thumbnail: candidate.thumbnail ?? null,
			}
		: null;
}

/** Everything the in-player info overlay shows — so it never re-fetches meta. */
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

/** A resume marker only once there's a real position into a known duration. */
export function resumePoint(
	progress: { duration: number; position: number } | null,
) {
	return progress && progress.duration > 0 && progress.position > 5000
		? { position: progress.position, duration: progress.duration }
		: null;
}

interface ProgressRow {
	progress_key: string;
	duration: number;
	position: number;
}

/**
 * Assemble the `playbackContext` payload from a title's meta and the profile's
 * watch-progress rows. Pure — the query handler owns the I/O.
 */
export function assemblePlaybackContext(input: {
	type: string;
	id: string;
	meta: Meta | undefined;
	progressRows: readonly ProgressRow[];
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
	const key = progressKey(contentId, season, episode);
	const progress =
		input.progressRows.find((row) => row.progress_key === key) ?? null;

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
		resume: resumePoint(progress),
	};
}
