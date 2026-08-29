import { libraryItems } from "$lib/library/library.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return { items: await libraryItems() };
};
