import { titleMeta } from "#lib/addons/server.js";
import { pullWatchStats } from "#lib/stats/stats-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

// Streamed, never awaited; genres come from addon meta, joined here.
export const load: PageServerLoad = ({ locals, fetch }) => ({
	stats: pullWatchStats(
		profileData(locals, fetch),
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	).catch(() => null),
});
