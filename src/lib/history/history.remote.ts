import { query } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";

export const watchHistory = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.watchHistory.pull({
		p_profile_id: profileId,
		p_page: 1,
		p_page_size: 500,
	});
	return items.map((item) => ({
		id: item.id,
		contentId: item.content_id,
		type: item.content_type,
		title: item.title,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watched_at,
	}));
});
