import type { Meta } from "#lib/addons/index.js";
import { pooledMap } from "#lib/core/pool.js";
import type { NuvioClient } from "#lib/nuvio/index.js";

/** Injected so this module stays free of `$app/server` (and unit-testable). */
export type MetaLookup = (type: string, id: string) => Promise<Meta | null>;

const STATS_META_CONCURRENCY = 4;

/** Watch-time / counts / top genres for the account stats tab. */
export interface WatchStats {
	movieMinutes: number;
	seriesMinutes: number;
	movieCount: number;
	seriesCount: number;
	episodeCount: number;
	preferredFormat: "movie" | "series" | null;
	topGenres: Array<{ name: string; count: number }>;
}

export async function pullWatchStats(
	nuvio: NuvioClient,
	profileId: number,
	lookupMeta: MetaLookup,
): Promise<WatchStats> {
	const [progressRows, historyRows] = await Promise.all([
		nuvio.watchProgress
			.pull({ p_profile_id: profileId, p_limit: 2000 })
			.catch(() => [] as Awaited<ReturnType<typeof nuvio.watchProgress.pull>>),
		nuvio.watchHistory
			.pull({ p_profile_id: profileId, p_page: 1, p_page_size: 2000 })
			.catch(() => [] as Awaited<ReturnType<typeof nuvio.watchHistory.pull>>),
	]);

	// Time watched = the furthest position reached on each video (progress rows).
	let movieMs = 0;
	let seriesMs = 0;
	for (const row of progressRows) {
		const watched =
			row.duration > 0 ? Math.min(row.position, row.duration) : row.position;
		if (row.content_type === "series") {
			seriesMs += watched;
		} else {
			movieMs += watched;
		}
	}

	const movieIds = new Set<string>();
	const seriesIds = new Set<string>();
	let episodeCount = 0;
	for (const row of historyRows) {
		if (row.content_type === "series") {
			seriesIds.add(row.content_id);
			episodeCount += 1;
		} else {
			movieIds.add(row.content_id);
		}
	}

	// Genre tally from the most-recent unique titles (getMeta is server-cached).
	const uniqueRecent = [
		...new Map(historyRows.map((row) => [row.content_id, row])).values(),
	].slice(0, 30);
	const genreCount = new Map<string, number>();
	// Pooled: unbounded, a many-title history bursts every meta addon at once.
	await pooledMap(uniqueRecent, STATS_META_CONCURRENCY, async (row) => {
		const meta = await lookupMeta(row.content_type, row.content_id).catch(
			() => null,
		);
		for (const genre of meta?.genres ?? []) {
			genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
		}
	});
	const topGenres = [...genreCount.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([name, count]) => ({ name, count }));

	return {
		movieMinutes: Math.round(movieMs / 60_000),
		seriesMinutes: Math.round(seriesMs / 60_000),
		movieCount: movieIds.size,
		seriesCount: seriesIds.size,
		episodeCount,
		preferredFormat:
			seriesMs === 0 && movieMs === 0
				? null
				: seriesMs >= movieMs
					? ("series" as const)
					: ("movie" as const),
		topGenres,
	};
}
