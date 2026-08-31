import {
	pullLibraryItems,
	pullLibraryProgress,
} from "$lib/library/library-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Streamed, not awaited — the grid fills in behind the store / a skeleton.
	const nuvio = locals.nuvio.withFetch(fetch);
	const profileId = locals.profileId ?? 0;

	return {
		items: pullLibraryItems(nuvio, profileId),
		progress: pullLibraryProgress(nuvio, profileId),
	};
};
