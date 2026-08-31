import { query } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";

/** `content_id`s currently in this profile's library (first page). Client-side. */
export const libraryIds = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.library.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
	return items.map((item) => item.content_id);
});
