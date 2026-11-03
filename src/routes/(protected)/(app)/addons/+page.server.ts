import { addonDirectory } from "#lib/addons/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => ({
	directory: addonDirectory(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	).catch(() => null),
});
