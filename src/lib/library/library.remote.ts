import { requireProfile } from "#lib/server/guards.js";
import { profileData } from "#lib/userdata/server.js";
import { query } from "$app/server";

/** `content_id`s currently in this profile's library. Client-side. */
export const libraryIds = query(async () => {
	const { event } = requireProfile();
	const items = await profileData(event.locals, event.fetch).library();
	return items.map((item) => item.contentId);
});
