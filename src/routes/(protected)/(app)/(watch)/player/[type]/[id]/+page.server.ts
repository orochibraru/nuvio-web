import { titleMeta } from "#lib/addons/server.js";
import { profileData } from "#lib/userdata/server.js";
import {
	pullPlaybackMeta,
	pullPlaybackResume,
	pullUpcoming,
} from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	// Streamed, never awaited: the player shell paints on navigation and these
	// fill in behind it. Meta and resume are separate promises so the resume
	// seek never waits on the slowest meta addon.
	const video = { type: params.type, id: params.id };
	const context = pullPlaybackMeta(
		video,
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	).catch(() => null);
	return {
		context,
		resume: pullPlaybackResume(profileData(locals, fetch), video).catch(
			() => null,
		),
		// Its own promise, chained off the context, so a schedule lookup that
		// has to go to TVmaze never holds up the player's heading.
		upcoming: context.then((ctx) => pullUpcoming(ctx)).catch(() => null),
	};
};
