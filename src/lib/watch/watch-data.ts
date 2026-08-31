import type { NuvioClient } from "$lib/nuvio/index.js";

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
 * Raw in-progress rows for the home "continue watching" row — user data only, no
 * addon calls, so the home page load never blocks on a slow provider. The page
 * enriches these (poster / name / next-episode roll-forward) from the local sync
 * store and the client-side `continueWatching` query.
 */
export async function pullResumeRows(
	nuvio: NuvioClient,
	profileId: number,
): Promise<ResumeRow[]> {
	const rows = await nuvio.watchProgress
		.pull({ p_profile_id: profileId, p_limit: 30 })
		.catch(() => []);

	const seen = new Set<string>();
	return rows
		.filter((row) => row.duration > 60_000 && row.position < row.duration * 0.9)
		.sort((a, b) => b.last_watched - a.last_watched)
		.filter((row) => {
			if (seen.has(row.content_id)) {
				return false;
			}
			seen.add(row.content_id);
			return true;
		})
		.slice(0, 16)
		.map((row) => ({
			id: row.content_id,
			type: row.content_type,
			name: row.content_id,
			poster: null,
			background: null,
			logo: null,
			videoId: row.video_id,
			season: row.season,
			episode: row.episode,
			progress: row.position / row.duration,
			remainingMs: Math.max(0, row.duration - row.position),
		}));
}
