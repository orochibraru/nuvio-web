import { titleMeta } from "#lib/addons/server.js";
import { pullPlaybackContext } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	// Streamed, never awaited: the player shell paints on navigation and this
	// fills in behind it : same as before, minus the extra client round trip
	// that used to have to wait for hydration first.
	const nuvio = locals.nuvio.withFetch(fetch);
	return {
		context: pullPlaybackContext(
			nuvio,
			locals.profileId ?? 0,
			{ type: params.type, id: params.id },
			async (type, id) => (await titleMeta(type, id))?.meta ?? null,
		).catch(() => null),
	};
};
