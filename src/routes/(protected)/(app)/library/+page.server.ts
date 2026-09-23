import {
	pullLibraryItems,
	pullLibraryProgress,
} from "#lib/library/library-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Streamed, not awaited : the grid fills in behind the store / a skeleton.
	const data = profileData(locals, fetch);

	return {
		items: pullLibraryItems(data),
		progress: pullLibraryProgress(data),
	};
};
