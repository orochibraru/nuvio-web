import { getAddonClient, titleMeta } from "#lib/addons/server.js";
import { pullMediaSegments } from "#lib/player/segments-data.js";
import { profileData } from "#lib/userdata/server.js";
import { parseVideoId } from "#lib/watch/playback-context.js";
import {
	pullPlaybackMeta,
	pullPlaybackResume,
	pullStreams,
	pullSubtitles,
	pullUpcoming,
} from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({
	params,
	locals,
	fetch,
	parent,
	url,
}) => {
	// Streamed, never awaited: the player shell paints on navigation and these
	// fill in behind it. Meta and resume are separate promises so the resume
	// seek never waits on the slowest meta addon.
	const video = { type: params.type, id: params.id };
	const parsed = parseVideoId(video.type, video.id);
	const context = pullPlaybackMeta(
		video,
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	).catch(() => null);
	const client = getAddonClient().then((addons) => addons.client);
	return {
		context,
		resume: pullPlaybackResume(profileData(locals, fetch), video).catch(
			() => null,
		),
		// Its own promise, chained off the context, so a schedule lookup that
		// has to go to TVmaze never holds up the player's heading.
		upcoming: context.then((ctx) => pullUpcoming(ctx)).catch(() => null),
		// A URL that names its stream (a pick from the drawer, a reload) plays
		// it from this browser's storage: no fan-out to the addons for it.
		streams: url.searchParams.has("stream")
			? null
			: client.then((addons) => pullStreams(addons, video)).catch(() => null),
		subtitles: client
			.then((addons) =>
				pullSubtitles(addons, {
					type: video.type === "series" ? "series" : "movie",
					id: video.id,
				}),
			)
			.catch(() => []),
		segments: parent()
			.then(({ ui }) =>
				pullMediaSegments({
					contentId: parsed.contentId,
					season: parsed.season ?? null,
					episode: parsed.episode ?? null,
					apiKey: ui.introDbApiKey,
				}),
			)
			.catch(() => null),
	};
};
