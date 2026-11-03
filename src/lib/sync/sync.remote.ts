import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { m } from "#lib/i18n/index.js";
import { requireProfile } from "#lib/server/guards.js";
import { MAX_FLUSH_WRITES, PROFILE_MISMATCH_STATUS } from "#lib/sync/types.js";
import { localWrites } from "#lib/userdata/merge.js";
import { NUVIO_SYNC, USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { command, query } from "$app/server";

/**
 * The client store's sync endpoints, served from this server's own store (see
 * `docs/sync.md`). Nuvio is only reached for a profile's first-ever import;
 * everything else it gets through `NuvioSync` in the background.
 */
function userData(clientProfileId: number) {
	const { event, nuvio, profileId, accountKey: userId } = requireProfile();
	// The profile cookie is shared by every tab: another one may have switched it.
	if (clientProfileId !== profileId) {
		error(PROFILE_MISMATCH_STATUS, m.error_profile_changed());
	}
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

const profileIdSchema = v.pipe(v.number(), v.integer());

/** Everything the profile has, plus the cursors to pull deltas from. */
export const syncSnapshot = query(
	v.object({ profileId: profileIdSchema }),
	async (input) => {
		const { nuvio, nuvioSync, profileId, store, userId } = userData(
			input.profileId,
		);
		await nuvioSync.ensureImported(userId, profileId, nuvio);
		return store.snapshot(userId, profileId);
	},
);

const cursorsSchema = v.object({
	library: v.number(),
	watchProgress: v.number(),
	watchHistory: v.number(),
});

/** What changed since the client's cursors: records keyed by identity, `null` for a delete. */
export const syncDeltas = query(
	v.object({ profileId: profileIdSchema, cursors: cursorsSchema }),
	(input) => {
		const { profileId, store, userId } = userData(input.profileId);
		return store.deltas(userId, profileId, input.cursors);
	},
);

const contentTypeSchema = v.picklist(["movie", "series"]);

function batchOf<T extends v.GenericSchema>(item: T) {
	return v.optional(v.pipe(v.array(item), v.maxLength(MAX_FLUSH_WRITES)), []);
}

const writeBatchSchema = v.object({
	profileId: profileIdSchema,
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
		v.object({
			content_id: v.string(),
			content_type: contentTypeSchema,
			deleted_at: v.number(),
		}),
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
	progressDeletes: batchOf(
		v.object({ progress_key: v.string(), deleted_at: v.number() }),
	),
	historyDeletes: batchOf(
		v.object({
			content_id: v.string(),
			season: v.optional(v.number()),
			episode: v.optional(v.number()),
			deleted_at: v.number(),
		}),
	),
	historyRestores: batchOf(
		v.object({
			content_id: v.string(),
			content_type: contentTypeSchema,
			title: v.string(),
			season: v.optional(v.number()),
			episode: v.optional(v.number()),
			watched_at: v.number(),
			restored_at: v.number(),
		}),
	),
});

const flushSchema = v.pipe(
	writeBatchSchema,
	v.check(
		(batch) =>
			batch.libraryUpserts.length +
				batch.libraryDeletes.length +
				batch.progressPushes.length +
				batch.progressDeletes.length +
				batch.historyDeletes.length +
				batch.historyRestores.length <=
			MAX_FLUSH_WRITES,
	),
);

/** Apply a batch of queued optimistic mutations. Idempotent, so safe to retry. */
export const flushWrites = command(flushSchema, (batch) => {
	const { profileId, store, userId } = userData(batch.profileId);
	store.applyWrites(userId, profileId, localWrites(batch, Date.now()));
	return { ok: true };
});
