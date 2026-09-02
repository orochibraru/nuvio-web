import type { Meta } from "#lib/addons/index.js";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { pooledMap } from "#lib/pool.js";
import type { ContentType } from "#lib/sync/types.js";

export interface HistoryRow {
	id: string;
	contentId: string;
	type: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watchedAt: number;
}

/** Injected so this module stays free of `$app/server` (and unit-testable). */
export type MetaLookup = (type: string, id: string) => Promise<Meta | null>;

// The same burst risk as continue-watching: one `getMeta` per unique title,
// each fanning out to every meta addon. Unbounded, some time out and the row
// falls back to showing a bare content id.
const HISTORY_META_CONCURRENCY = 4;

/** Raw history rows : user data only, no addon calls. */
export async function pullWatchHistory(
	nuvio: NuvioClient,
	profileId: number,
): Promise<HistoryRow[]> {
	const items = await nuvio.watchHistory
		.pull({ p_profile_id: profileId, p_page: 1, p_page_size: 500 })
		.catch(() => []);
	return items.map((item) => ({
		id: item.id,
		contentId: item.content_id,
		type: item.content_type,
		title: item.title || item.content_id,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watched_at,
	}));
}

/**
 * History rows enriched with poster + clean title from the addons. One lookup
 * covers every row of the same title, and only the most-recent 40 unique
 * titles are looked up at all. Called from the account load (streamed).
 */
export async function pullEnrichedHistory(
	nuvio: NuvioClient,
	profileId: number,
	lookupMeta: MetaLookup,
): Promise<Array<HistoryRow & { poster: string | null }>> {
	const rows = await pullWatchHistory(nuvio, profileId);
	const uniqueRecent = [
		...new Map(rows.map((row) => [row.contentId, row])).values(),
	].slice(0, 40);

	const looked = await pooledMap(
		uniqueRecent,
		HISTORY_META_CONCURRENCY,
		async (row) => {
			const meta = await lookupMeta(row.type, row.contentId).catch(() => null);
			return [
				row.contentId,
				{ poster: meta?.poster ?? null, name: meta?.name ?? null },
			] as const;
		},
	);
	const meta = new Map(looked);

	return rows.map((row) => {
		// `pullWatchHistory` already substitutes the content id for a row with
		// no stored title, so "still just the id" is what "unnamed" looks like
		// here : otherwise the addon's name could never win.
		const stored = row.title && row.title !== row.contentId ? row.title : null;
		return {
			...row,
			title: stored ?? meta.get(row.contentId)?.name ?? row.contentId,
			poster: meta.get(row.contentId)?.poster ?? null,
		};
	});
}
