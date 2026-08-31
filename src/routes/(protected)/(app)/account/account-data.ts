import type { NuvioClient } from "$lib/nuvio/index.js";

/** Per-profile row counts for the account page. Empty on failure. */
export async function pullSyncOverview(nuvio: NuvioClient): Promise<{
	profiles: Array<{
		index: number;
		name: string;
		color: string;
		addons: number;
		library: number;
		watchProgress: number;
		watched: number;
	}>;
}> {
	const overview = await nuvio.getSyncOverview().catch(() => null);
	if (!overview) {
		return { profiles: [] };
	}
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
}
