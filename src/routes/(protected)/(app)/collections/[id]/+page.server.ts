import { error } from "@sveltejs/kit";
import { catalogList } from "$lib/addons/addons.remote";
import { getCollections } from "$lib/collections/collections.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	// The collection metadata + catalog list (user data / addon manifests) are
	// awaited; each folder's resolved contents (addon catalog fetches) load
	// client-side with a skeleton so a slow addon never stalls the page.
	const [collections, catalogs] = await Promise.all([
		getCollections(),
		catalogList(),
	]);
	const collection = collections.find((entry) => entry.id === params.id);
	if (!collection) {
		error(404, "Collection not found");
	}
	return { collection, catalogs, allCollections: collections };
};
