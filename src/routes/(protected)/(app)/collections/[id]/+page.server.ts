import { error } from "@sveltejs/kit";
import { catalogList } from "$lib/addons/addons.remote";
import {
	collectionContents,
	getCollections,
} from "$lib/collections/collections.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const [contents, collections, catalogs] = await Promise.all([
		collectionContents(params.id),
		getCollections(),
		catalogList(),
	]);
	const collection = collections.find((entry) => entry.id === params.id);
	if (!collection) {
		error(404, "Collection not found");
	}
	return { contents, collection, catalogs, allCollections: collections };
};
