import { getCollections } from "$lib/collections/collections.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return { collections: await getCollections() };
};
