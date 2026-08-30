import { query } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";

/** `content_id`s currently in this profile's library (first page). */
export const libraryIds = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.library.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
	return items.map((item) => item.content_id);
});

/** Library items as poster-card data, most recently added first. */
export const libraryItems = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.library.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
	return items.map((item) => ({
		id: item.content_id,
		type: item.content_type,
		name: item.name,
		poster: item.poster ?? undefined,
		releaseInfo: item.release_info ?? undefined,
		imdbRating: item.imdb_rating ?? undefined,
	}));
});

/** `content_id` → furthest in-progress fraction (incomplete only). Powers resume bars on cards. */
export const libraryProgress = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const rows = await nuvio.watchProgress.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
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
});
