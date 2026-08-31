import * as v from "valibot";
import { command, query } from "$app/server";
import type { LibraryItemInput, WatchProgressInput } from "$lib/nuvio/index.js";
import { settleAll } from "$lib/pool.js";
import { requireProfile } from "$lib/server/guards.js";

const ORIGIN_CLIENT_ID = "nuvio-web";
const DELTA_LIMIT = 500;
const WRITE_CHUNK = 500;

function chunked<T>(list: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) {
		out.push(list.slice(i, i + size));
	}
	return out;
}

/**
 * Bootstrap snapshot: the delta cursors are read *before* the snapshot pulls so
 * a follow-up `syncDeltas` call catches anything that changed during paging.
 */
export const syncSnapshot = query(async () => {
	const { nuvio, profileId } = requireProfile();

	const [libraryCursor, progressCursor, historyCursor] = await Promise.all([
		nuvio.library.deltaCursor(profileId),
		nuvio.watchProgress.deltaCursor(profileId),
		nuvio.watchHistory.deltaCursor(profileId),
	]);

	const [library, watchProgress, watchHistory] = await Promise.all([
		nuvio.library.pull({ p_profile_id: profileId, p_limit: 1000 }),
		nuvio.watchProgress.pull({ p_profile_id: profileId, p_limit: 1000 }),
		nuvio.watchHistory.pull({
			p_profile_id: profileId,
			p_page: 1,
			p_page_size: 1000,
		}),
	]);

	return {
		cursors: {
			library: libraryCursor,
			watchProgress: progressCursor,
			watchHistory: historyCursor,
		},
		library,
		watchProgress,
		watchHistory,
	};
});

const cursorsSchema = v.object({
	library: v.number(),
	watchProgress: v.number(),
	watchHistory: v.number(),
});

export const syncDeltas = query(cursorsSchema, async (cursors) => {
	const { nuvio, profileId } = requireProfile();

	const [library, watchProgress, watchHistory] = await Promise.all([
		nuvio.library.pullDelta({
			p_profile_id: profileId,
			p_since_event_id: cursors.library,
			p_limit: DELTA_LIMIT,
		}),
		nuvio.watchProgress.pullDelta({
			p_profile_id: profileId,
			p_since_event_id: cursors.watchProgress,
			p_limit: DELTA_LIMIT,
		}),
		nuvio.watchHistory.pullDelta({
			p_profile_id: profileId,
			p_since_event_id: cursors.watchHistory,
			p_limit: DELTA_LIMIT,
		}),
	]);

	return { library, watchProgress, watchHistory };
});

const contentTypeSchema = v.picklist(["movie", "series"]);

const writeBatchSchema = v.object({
	libraryUpserts: v.optional(
		v.array(
			v.object({
				content_id: v.string(),
				content_type: contentTypeSchema,
				name: v.optional(v.string()),
				poster: v.optional(v.string()),
				background: v.optional(v.string()),
				description: v.optional(v.string()),
				release_info: v.optional(v.string()),
				imdb_rating: v.optional(v.number()),
				genres: v.optional(v.array(v.string())),
				added_at: v.number(),
			}),
		),
		[],
	),
	libraryDeletes: v.optional(
		v.array(
			v.object({
				content_id: v.string(),
				content_type: contentTypeSchema,
			}),
		),
		[],
	),
	progressPushes: v.optional(
		v.array(
			v.object({
				content_id: v.string(),
				content_type: contentTypeSchema,
				video_id: v.string(),
				season: v.optional(v.number()),
				episode: v.optional(v.number()),
				position: v.number(),
				duration: v.number(),
				last_watched: v.number(),
			}),
		),
		[],
	),
	progressDeletes: v.optional(v.array(v.string()), []),
	historyDeletes: v.optional(
		v.array(
			v.object({
				content_id: v.string(),
				season: v.optional(v.number()),
				episode: v.optional(v.number()),
			}),
		),
		[],
	),
});

/** Apply a batch of queued optimistic mutations. Idempotent enough to retry. */
export const flushWrites = command(writeBatchSchema, async (batch) => {
	const { nuvio, profileId } = requireProfile();

	if (batch.libraryUpserts.length > 0) {
		const items: LibraryItemInput[] = batch.libraryUpserts.map((entry) => ({
			content_id: entry.content_id,
			content_type: entry.content_type,
			name: entry.name,
			poster: entry.poster,
			background: entry.background,
			description: entry.description,
			release_info: entry.release_info,
			imdb_rating: entry.imdb_rating,
			genres: entry.genres,
			added_at: entry.added_at,
		}));
		await settleAll(
			chunked(items, WRITE_CHUNK).map((slice) =>
				nuvio.library.upsertItems({
					p_profile_id: profileId,
					p_origin_client_id: ORIGIN_CLIENT_ID,
					p_items: slice,
				}),
			),
		);
	}

	if (batch.libraryDeletes.length > 0) {
		await settleAll(
			chunked(batch.libraryDeletes, WRITE_CHUNK).map((slice) =>
				nuvio.library.deleteItems({
					p_profile_id: profileId,
					p_origin_client_id: ORIGIN_CLIENT_ID,
					p_keys: slice,
				}),
			),
		);
	}

	if (batch.progressPushes.length > 0) {
		const entries: WatchProgressInput[] = batch.progressPushes.map((entry) => ({
			content_id: entry.content_id,
			content_type: entry.content_type,
			video_id: entry.video_id,
			season: entry.season,
			episode: entry.episode,
			position: Math.round(entry.position),
			duration: Math.round(entry.duration),
			last_watched: entry.last_watched,
		}));
		await settleAll(
			chunked(entries, WRITE_CHUNK).map((slice) =>
				nuvio.watchProgress.push({
					p_profile_id: profileId,
					p_entries: slice,
				}),
			),
		);
	}

	if (batch.progressDeletes.length > 0) {
		await nuvio.watchProgress.deleteMany(batch.progressDeletes, profileId);
	}

	await settleAll(
		batch.historyDeletes.map((entry) =>
			nuvio.watchHistory.delete(
				[
					{
						content_id: entry.content_id,
						season: entry.season,
						episode: entry.episode,
					},
				],
				profileId,
			),
		),
	);

	return { ok: true };
});
