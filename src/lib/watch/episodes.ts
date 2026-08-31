import type { Meta } from "#lib/addons/index.js";

/**
 * The episode immediately after `season`/`episode` in play order, or `null`
 * when it's the last one (or the input isn't an episode). Season 0 / specials
 * are excluded.
 */
export function nextEpisode(
	videos: NonNullable<Meta["videos"]> | undefined,
	season: number | null,
	episode: number | null,
): { season: number; episode: number } | null {
	if (!videos || season == null || episode == null) {
		return null;
	}
	const ordered = videos
		.filter((entry) => (entry.season ?? 0) > 0 && (entry.episode ?? 0) > 0)
		.sort(
			(a, b) =>
				(a.season ?? 0) - (b.season ?? 0) ||
				(a.episode ?? 0) - (b.episode ?? 0),
		);
	const index = ordered.findIndex(
		(entry) => entry.season === season && entry.episode === episode,
	);
	const candidate = index >= 0 ? ordered[index + 1] : undefined;
	return candidate
		? { season: candidate.season ?? 0, episode: candidate.episode ?? 0 }
		: null;
}
