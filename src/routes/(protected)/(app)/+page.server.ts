import { homeRows } from "$lib/addons/addons.remote";
import { libraryItems } from "$lib/library/library.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [rows, library] = await Promise.all([homeRows(), libraryItems()]);
	return { rows, library };
};
