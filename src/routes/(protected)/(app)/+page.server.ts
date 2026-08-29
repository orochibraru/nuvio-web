import { homeRows } from "$lib/addons/addons.remote";
import { libraryItems } from "$lib/library/library.remote";
import { continueWatching } from "$lib/watch/watch.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [rows, library, resume] = await Promise.all([
		homeRows(),
		libraryItems(),
		continueWatching(),
	]);
	return { rows, library, resume };
};
