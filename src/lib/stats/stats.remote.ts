import { titleMeta } from "#lib/addons/server.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import { pullWatchStats } from "./stats-data.ts";

/** Kept for parity; the account load calls `pullWatchStats` directly. */
export const watchStats = query(() => {
	const { nuvio, profileId } = requireProfile();
	return pullWatchStats(
		nuvio,
		profileId,
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	);
});
