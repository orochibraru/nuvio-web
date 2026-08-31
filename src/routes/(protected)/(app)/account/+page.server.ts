import type { PageServerLoad } from "./$types";
import { pullSyncOverview } from "./account-data";

export const load: PageServerLoad = ({ locals, fetch }) => {
	return { overview: pullSyncOverview(locals.nuvio.withFetch(fetch)) };
};
