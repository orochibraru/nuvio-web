import { catalogPage, listCatalogs } from "#lib/addons/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
	const selectedKey = url.searchParams.get("c");
	const genre = url.searchParams.get("g") ?? "";

	const catalogs = listCatalogs();

	// The first page of the selected catalog is resolved here rather than by a
	// client query. The URL already names the catalog, so the server can start
	// fetching it straight away instead of the browser waiting for the catalog
	// list to land, deriving the selection, and paying a second round trip.
	// Streamed (unawaited) like `catalogs`, so navigation still paints
	// instantly behind the grid skeleton. `null` on any failure : the page
	// shows its retry state rather than a 500.
	const firstPage = catalogs
		.then((list) => {
			const selected =
				list.find(
					(entry) =>
						`${entry.addonId}|${entry.type}|${entry.id}` === selectedKey,
				) ?? list[0];
			return selected
				? catalogPage({
					addonId: selected.addonId,
					type: selected.type,
					id: selected.id,
					genre: genre || undefined,
				})
				: null;
		})
		.catch(() => null);

	return { catalogs, firstPage, selectedKey, genre };
};
