import { listCatalogs } from "#lib/addons/server.js";
import {
	pullCollections,
	pullFolderContents,
} from "#lib/collections/collections-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	// Both stream in (unawaited). The page resolves `params.id` against the
	// collection list and shows a "not found" state itself : no blocking 404.
	const collections = pullCollections(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	);
	const collection = collections.then(
		(list) => list.find((entry) => entry.id === params.id) ?? null,
	);
	return {
		id: params.id,
		collections,
		collection,
		// The folders' titles: every catalog source fanned out on the server,
		// chained off the same pull, rather than a client query that could only
		// start once the page had shipped and hydrated.
		contents: collection.then(pullFolderContents).catch(() => []),
		catalogs: listCatalogs(),
	};
};
