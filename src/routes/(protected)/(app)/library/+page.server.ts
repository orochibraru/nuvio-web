import { libraryItems, libraryProgress } from "$lib/library/library.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [items, progress] = await Promise.all([
		libraryItems(),
		libraryProgress(),
	]);
	return { items, progress };
};
