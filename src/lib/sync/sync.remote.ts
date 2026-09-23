import * as v from "valibot";
import { requireProfile } from "#lib/server/guards.js";
import { localWrites } from "#lib/userdata/merge.js";
import { NUVIO_SYNC, USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { command, query } from "$app/server";

/**
 * The client store's sync endpoints, served from this server's own store (see
 * `docs/sync.md`). Nuvio is only reached for a profile's first-ever import;
 * everything else it gets through `NuvioSync` in the background.
 */
function userData() {
	const { event, nuvio, profileId, userId } = requireProfile();
	const services = event.locals.services;
	const nuvioSync = services.get(NUVIO_SYNC);
	nuvioSync.touch(userId);
	return {
		nuvio,
		nuvioSync,
		profileId,
		store: services.get(USER_DATA_STORE),
		userId,
	};
}

/** Everything the profile has, plus the cursors to pull deltas from. */
export const syncSnapshot = query(async () => {
	const { nuvio, nuvioSync, profileId, store, userId } = userData();
	await nuvioSync.ensureImported(userId, profileId, nuvio);
	return store.snapshot(userId, profileId);
});

const cursorsSchema = v.object({
	library: v.number(),
	watchProgress: v.number(),
	watchHistory: v.number(),
});

/** What changed since the client's cursors: records keyed by identity, `null` for a delete. */
export const syncDeltas = query(cursorsSchema, (cursors) => {
	const { profileId, store, userId } = userData();
	return store.deltas(userId, profileId, cursors);
});

const contentTypeSchema = v.picklist(["movie", "series"]);

// Bounds what one request can write; the client's queue is far smaller.
const MAX_WRITES = 5000;
function batchOf<T extends v.GenericSchema>(item: T) {
	return v.optional(v.pipe(v.array(item), v.maxLength(MAX_WRITES)), []);
}

const writeBatchSchema = v.object({
	libraryUpserts: batchOf(
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
	libraryDeletes: batchOf(
		v.object({ content_id: v.string(), content_type: contentTypeSchema }),
	),
	progressPushes: batchOf(
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
	progressDeletes: batchOf(v.string()),
	historyDeletes: batchOf(
		v.object({
			content_id: v.string(),
			season: v.optional(v.number()),
			episode: v.optional(v.number()),
		}),
	),
});

/** Apply a batch of queued optimistic mutations. Idempotent, so safe to retry. */
export const flushWrites = command(writeBatchSchema, (batch) => {
	const { profileId, store, userId } = userData();
	store.applyWrites(userId, profileId, localWrites(batch, Date.now()));
	return { ok: true };
});
