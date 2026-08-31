import { pullWatchHistory } from "$lib/history/history-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	return {
		items: pullWatchHistory(
			locals.nuvio.withFetch(fetch),
			locals.profileId ?? 0,
		),
	};
};
