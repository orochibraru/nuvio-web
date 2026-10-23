import { titleMeta } from "#lib/addons/server.js";
import { pullEnrichedHistory } from "#lib/history/history-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

// Streamed, never awaited. The addon enrichment (posters / clean titles) runs
// here rather than in a client query, so rows arrive named instead of showing
// raw content ids until a second round trip lands.
export const load: PageServerLoad = ({ locals, fetch }) => ({
	items: pullEnrichedHistory(
		profileData(locals, fetch),
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	).catch(() => []),
});
