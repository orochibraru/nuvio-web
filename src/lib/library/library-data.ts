import type { NuvioClient } from "#lib/nuvio/index.js";
import type { ContentType } from "#lib/sync/types.js";

/**
 * SSR helpers for the home / library page loads. Every one degrades to an empty
 * result on a slow or failed pull : the local sync store is the real source on
 * those screens and fills in once it's authoritative.
 */

export interface LibraryCard {
	id: string;
	type: ContentType;
	name: string;
	poster?: string;
	releaseInfo?: string;
	imdbRating?: number;
}

export async function pullLibraryItems(
	nuvio: NuvioClient,
	profileId: number,
): Promise<LibraryCard[]> {
	const items = await nuvio.library
		.pull({ p_profile_id: profileId, p_limit: 500 })
		.catch(() => []);
	return items.map((item) => ({
		id: item.content_id,
		type: item.content_type,
		name: item.name,
		poster: item.poster ?? undefined,
		releaseInfo: item.release_info ?? undefined,
		imdbRating: item.imdb_rating ?? undefined,
	}));
}

/** `content_id` → furthest in-progress fraction (incomplete only). Resume bars. */
export async function pullLibraryProgress(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Record<string, number>> {
	const rows = await nuvio.watchProgress
		.pull({ p_profile_id: profileId, p_limit: 500 })
		.catch(() => []);
	const byContent: Record<string, number> = {};
	for (const row of rows) {
		if (row.duration <= 0) {
			continue;
		}
		const fraction = row.position / row.duration;
		if (fraction >= 0.9 || fraction <= 0.02) {
			continue;
		}
		byContent[row.content_id] = Math.max(
			byContent[row.content_id] ?? 0,
			Math.min(1, fraction),
		);
	}
	return byContent;
}
