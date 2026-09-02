import { homeCatalogRows, titleMeta } from "#lib/addons/server.js";
import { pullLibraryItems } from "#lib/library/library-data.js";
import { pullContinueWatching } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Nothing is awaited: every pull is streamed to the page as a promise so
	// the navigation completes on the shell and each row fills in behind its
	// own skeleton. All three are self-recovering (empty on failure).
	//
	// The catalog rows and the continue-watching enrichment run here rather
	// than in client queries — the browser would otherwise have to wait for
	// the page, hydrate, and only then start the round trip that fetches the
	// content, and continue-watching cards would show their raw content ids
	// until it landed.
	const nuvio = locals.nuvio.withFetch(fetch);
	const metaLookup = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;
	const profileId = locals.profileId ?? 0;

	return {
		library: pullLibraryItems(nuvio, profileId),
		// `[]` is a real empty feed; `null` is "couldn't reach the addons" — the
		// page shows a retry for one and "add an addon" for the other.
		resume: pullContinueWatching(nuvio, profileId, metaLookup).catch(() => []),
		rows: homeCatalogRows().catch(() => null),
	};
};
