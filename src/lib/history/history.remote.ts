import { query } from "$app/server";
import { getAddonClient } from "$lib/addons/server.js";
import { requireProfile } from "$lib/server/guards.js";

export const watchHistory = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.watchHistory.pull({
		p_profile_id: profileId,
		p_page: 1,
		p_page_size: 500,
	});

	// Enrich the most-recent unique titles with poster + name (getMeta is
	// server-cached, and one lookup covers every row of the same title).
	const { client } = await getAddonClient();
	const meta = new Map<
		string,
		{ poster: string | null; name: string | null }
	>();
	const uniqueRecent = [
		...new Map(items.map((item) => [item.content_id, item])).values(),
	].slice(0, 40);
	await Promise.all(
		uniqueRecent.map(async (item) => {
			const result = await client
				.getMeta(item.content_type, item.content_id)
				.catch(() => null);
			meta.set(item.content_id, {
				poster: result?.meta.poster ?? null,
				name: result?.meta.name ?? null,
			});
		}),
	);

	return items.map((item) => ({
		id: item.id,
		contentId: item.content_id,
		type: item.content_type,
		title: item.title || meta.get(item.content_id)?.name || item.content_id,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watched_at,
		poster: meta.get(item.content_id)?.poster ?? null,
	}));
});
