import { homeCatalogRows, searchAllCatalogs } from "#lib/addons/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
	const term = (url.searchParams.get("q") ?? "").trim();

	// Both are streamed (unawaited) so typing stays responsive and navigation
	// never blocks on an addon. Resolving them here rather than in client
	// queries means results arrive with the page instead of after hydration
	// plus a round trip. `null` marks a failure — the page retries rather than
	// claiming there were no matches.
	return {
		term,
		results: term ? searchAllCatalogs(term).catch(() => null) : null,
		// Fallback rows for an empty query, or a query that matched nothing.
		browseRows: homeCatalogRows().catch(() => []),
	};
};
