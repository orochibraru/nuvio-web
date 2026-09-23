import { similarToTitle, titleMeta } from "#lib/addons/server.js";
import { profileData } from "#lib/userdata/server.js";
import {
	type TitleProgress,
	titleProgressFor,
} from "#lib/watch/playback-context.js";
import { pullNextToAir, pullProgressRows } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	const { type, id } = params;

	// Streamed (unawaited): navigation completes on the shell and the hero
	// fills in behind its skeleton. Resolving here rather than in a client
	// query means the addon fetch starts on the server as soon as the URL is
	// known, instead of after the page has shipped, hydrated, and made a
	// second round trip. `null` marks "no addon had it" : the page shows its
	// own not-found state.
	const meta = titleMeta(type, id).catch(() => null);

	// Chained off the same promise so "more like this" doesn't need the genres
	// to reach the browser first.
	const similar = meta
		.then((result) =>
			result
				? similarToTitle(type, id, result.meta.genres ?? [])
				: { metas: [] },
		)
		.catch(() => ({ metas: [] }));

	// Chained the same way: the meta answers when it lists an unaired episode,
	// and TVmaze only when it has run out.
	const nextToAir = meta
		.then((result) => pullNextToAir(result?.meta ?? null))
		.catch(() => null);

	// Started now, alongside the meta, and joined to it once both land: which
	// rows belong to this title (URL id or `tmdb:…` episode ids) is only
	// decidable against the meta's videos. The page reads the sync store
	// instead once it's authoritative.
	const rows = pullProgressRows(profileData(locals, fetch)).catch(() => []);
	const progress = meta
		.then(async (result) =>
			titleProgressFor(await rows, type, id, result?.meta.videos),
		)
		.catch((): TitleProgress => ({}));

	return { type, id, meta, similar, nextToAir, progress };
};
