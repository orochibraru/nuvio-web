import { similarToTitle, titleMeta } from "#lib/addons/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
	const { type, id } = params;

	// Streamed (unawaited): navigation completes on the shell and the hero
	// fills in behind its skeleton. Resolving here rather than in a client
	// query means the addon fetch starts on the server as soon as the URL is
	// known, instead of after the page has shipped, hydrated, and made a
	// second round trip. `null` marks "no addon had it" — the page shows its
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

	return { type, id, meta, similar };
};
