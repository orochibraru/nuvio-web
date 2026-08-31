import { listCatalogs } from "#lib/addons/server.js";
import { pullCollections } from "#lib/collections/collections-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	// Both stream in (unawaited). The page resolves `params.id` against the
	// collection list and shows a "not found" state itself — no blocking 404.
	const collections = pullCollections(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	);
	return {
		id: params.id,
		collections,
		collection: collections.then(
			(list) => list.find((entry) => entry.id === params.id) ?? null,
		),
		catalogs: listCatalogs(),
	};
};
