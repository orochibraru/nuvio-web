import { titleMeta } from "#lib/addons/server.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import { pullEnrichedHistory } from "./history-data.ts";

/** Kept for parity; the account load calls `pullEnrichedHistory` directly. */
export const watchHistory = query(() => {
	const { nuvio, profileId } = requireProfile();
	return pullEnrichedHistory(
		nuvio,
		profileId,
		async (type, id) => (await titleMeta(type, id))?.meta ?? null,
	);
});
