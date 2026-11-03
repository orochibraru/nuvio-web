import { titleMeta } from "#lib/addons/server.js";
import { pullNewEpisodes } from "#lib/library/calendar-data.js";
import {
	pullLibraryItems,
	pullLibraryProgress,
} from "#lib/library/library-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Streamed, not awaited : the grid fills in behind the store / a skeleton.
	const data = profileData(locals, fetch);
	const lookupMeta = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;

	return {
		items: pullLibraryItems(data),
		progress: pullLibraryProgress(data),
		newEpisodes: pullNewEpisodes(data, lookupMeta).catch(() => []),
	};
};
