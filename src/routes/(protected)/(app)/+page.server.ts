import { pullLibraryItems } from "#lib/library/library-data.js";
import { pullResumeRows } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Nothing is awaited: the two pulls are streamed to the page as promises so
	// the navigation completes on the shell and the rows fill in behind
	// skeletons. Both are user-data only and self-recovering (empty on failure).
	const nuvio = locals.nuvio.withFetch(fetch);
	const profileId = locals.profileId ?? 0;

	return {
		library: pullLibraryItems(nuvio, profileId),
		resume: pullResumeRows(nuvio, profileId),
	};
};
