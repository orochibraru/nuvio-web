import { listCatalogs } from "$lib/addons/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
	// The catalog list streams in (unawaited) behind a skeleton; the actual
	// catalog contents load client-side. `genre` / `selectedKey` are read from
	// the URL and resolved against the list on the client.
	return {
		catalogs: listCatalogs(),
		selectedKey: url.searchParams.get("c"),
		genre: url.searchParams.get("g") ?? "",
	};
};
