import type { NuvioClient } from "$lib/nuvio/index.js";
import type { ContentType } from "$lib/sync/types.js";

export interface HistoryRow {
	id: string;
	contentId: string;
	type: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watchedAt: number;
}

/**
 * Raw history rows for SSR — user data only, no addon `getMeta`. Posters + clean
 * titles come from the local library mirror and the client-side `watchHistory`
 * query.
 */
export async function pullWatchHistory(
	nuvio: NuvioClient,
	profileId: number,
): Promise<HistoryRow[]> {
	const items = await nuvio.watchHistory
		.pull({ p_profile_id: profileId, p_page: 1, p_page_size: 500 })
		.catch(() => []);
	return items.map((item) => ({
		id: item.id,
		contentId: item.content_id,
		type: item.content_type,
		title: item.title || item.content_id,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watched_at,
	}));
}
