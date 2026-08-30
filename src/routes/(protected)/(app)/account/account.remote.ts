import * as v from "valibot";
import { command, query } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";

/** Per-profile row counts for the signed-in account. */
export const syncOverview = query(async () => {
	const { nuvio } = requireProfile();
	const overview = await nuvio.getSyncOverview();
	const profiles = Object.entries(overview.profiles)
		.map(([index, meta]) => ({
			index: Number(index),
			name: meta.name,
			color: meta.color,
			addons: overview.addons[index] ?? 0,
			library: overview.library_items[index] ?? 0,
			watchProgress: overview.watch_progress[index] ?? 0,
			watched: overview.watched_items[index] ?? 0,
		}))
		.sort((a, b) => a.index - b.index);
	return { profiles };
});

export const deleteProfileData = command(
	v.object({ profileIndex: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ profileIndex }) => {
		const { nuvio } = requireProfile();
		await nuvio.profiles.deleteData(profileIndex);
		await syncOverview().refresh();
		return { ok: true };
	},
);
