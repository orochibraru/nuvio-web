import { libraryItems } from "$lib/library/library.remote";
import { continueWatching } from "$lib/watch/watch.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	// User data only — the addon-sourced catalog rows (and the spotlight derived
	// from them) load client-side with a skeleton so a slow addon never blocks
	// first paint or the click that navigated here.
	const [library, resume] = await Promise.all([
		libraryItems(),
		continueWatching(),
	]);
	return { library, resume };
};
