import { libraryProgressMap } from "#lib/sync/reconcile.js";
import type { ContentType } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";

/**
 * SSR helpers for the home / library page loads, read from this server's own
 * store. Every one degrades to an empty result : the client sync store fills
 * in once it's authoritative.
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
	data: ProfileData,
): Promise<LibraryCard[]> {
	const items = await data.library().catch(() => []);
	return items.map((item) => ({
		id: item.contentId,
		type: item.contentType,
		name: item.name,
		poster: item.poster ?? undefined,
		releaseInfo: item.releaseInfo ?? undefined,
		imdbRating: item.imdbRating ?? undefined,
	}));
}

/** `content_id` → furthest in-progress fraction (incomplete only). Resume bars. */
export async function pullLibraryProgress(
	data: ProfileData,
): Promise<Record<string, number>> {
	return libraryProgressMap(await data.progress().catch(() => []));
}
