import { titleMeta } from "#lib/addons/server.js";
import { pullEnrichedHistory } from "#lib/history/history-data.js";
import { pullWatchStats } from "#lib/stats/stats-data.js";
import type { PageServerLoad } from "./$types";
import { pullSyncOverview } from "./account-data.ts";

export const load: PageServerLoad = ({ locals, fetch }) => {
	const nuvio = locals.nuvio.withFetch(fetch);
	const profileId = locals.profileId ?? 0;
	const metaLookup = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;

	// Streamed, never awaited: each tab fills in behind its own skeleton. The
	// addon enrichment (posters / clean titles / genres) runs here rather than
	// in a client query, so rows arrive named instead of showing raw content
	// ids until a second round trip lands.
	return {
		overview: pullSyncOverview(nuvio),
		historyItems: pullEnrichedHistory(nuvio, profileId, metaLookup).catch(
			() => [],
		),
		stats: pullWatchStats(nuvio, profileId, metaLookup).catch(() => null),
	};
};
