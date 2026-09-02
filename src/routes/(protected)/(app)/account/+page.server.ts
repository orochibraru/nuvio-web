import { pullWatchHistory } from "#lib/history/history-data.js";
import type { PageServerLoad } from "./$types";
import { pullSyncOverview } from "./account-data.ts";

export const load: PageServerLoad = ({ locals, fetch }) => ({
	overview: pullSyncOverview(locals.nuvio.withFetch(fetch)),
	historyItems: pullWatchHistory(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	),
});
