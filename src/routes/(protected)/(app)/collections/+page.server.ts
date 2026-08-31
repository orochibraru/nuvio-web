import { pullCollections } from "$lib/collections/collections-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => ({
	collections: pullCollections(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	),
});
