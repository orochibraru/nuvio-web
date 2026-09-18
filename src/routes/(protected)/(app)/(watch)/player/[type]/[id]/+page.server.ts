import { titleMeta } from "#lib/addons/server.js";
import { pullPlaybackContext, pullUpcoming } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	// Streamed, never awaited: the player shell paints on navigation and this
	// fills in behind it : same as before, minus the extra client round trip
	// that used to have to wait for hydration first.
	const nuvio = locals.nuvio.withFetch(fetch);
	const context = pullPlaybackContext(
		nuvio,
		locals.profileId ?? 0,
		{ type: params.type, id: params.id },
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	).catch(() => null);
	return {
		context,
		// Its own promise, chained off the context, so a schedule lookup that
		// has to go to TVmaze never holds up the player's heading.
		upcoming: context.then((ctx) => pullUpcoming(ctx)).catch(() => null),
	};
};
