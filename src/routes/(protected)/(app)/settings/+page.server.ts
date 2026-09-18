import { listCatalogs } from "#lib/addons/server.js";
import { pullHomeLayout } from "#lib/settings/settings-data.js";
import type { PageServerLoad } from "./$types";

/**
 * Only the Home section needs server data : every catalog across the profile's
 * addons, and the saved arrangement : so only that section pays for the addon
 * fan-out. `url.searchParams` is tracked, so switching sections re-runs this.
 * Both stream (unawaited) behind the section's own skeleton.
 */
export const load: PageServerLoad = ({ url, locals, fetch }) => {
	if (url.searchParams.get("tab") !== "home") {
		return { home: null };
	}
	return {
		home: {
			layout: pullHomeLayout(
				locals.nuvio.withFetch(fetch),
				locals.profileId ?? 0,
			),
			catalogs: listCatalogs().catch(() => []),
		},
	};
};
