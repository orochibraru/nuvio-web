import * as v from "valibot";
import { command, query } from "$app/server";
import type { LibraryItemInput } from "$lib/nuvio/index.js";
import { requireProfile } from "$lib/server/guards.js";

const ORIGIN_CLIENT_ID = "nuvio-web";

/** `content_id`s currently in this profile's library (first page). */
export const libraryIds = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.library.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
	return items.map((item) => item.content_id);
});

/** Library items as poster-card data, most recently added first. */
export const libraryItems = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const items = await nuvio.library.pull({
		p_profile_id: profileId,
		p_limit: 500,
	});
	return items.map((item) => ({
		id: item.content_id,
		type: item.content_type,
		name: item.name,
		poster: item.poster ?? undefined,
		releaseInfo: item.release_info ?? undefined,
		imdbRating: item.imdb_rating ?? undefined,
	}));
});

const toggleSchema = v.object({
	content_id: v.string(),
	content_type: v.picklist(["movie", "series"]),
	remove: v.optional(v.boolean(), false),
	name: v.optional(v.string()),
	poster: v.optional(v.string()),
	background: v.optional(v.string()),
	description: v.optional(v.string()),
	release_info: v.optional(v.string()),
	imdb_rating: v.optional(v.number()),
	genres: v.optional(v.array(v.string())),
});

export const toggleLibrary = command(toggleSchema, async (input) => {
	const { nuvio, profileId } = requireProfile();

	if (input.remove) {
		await nuvio.library.deleteItems({
			p_profile_id: profileId,
			p_origin_client_id: ORIGIN_CLIENT_ID,
			p_keys: [
				{ content_id: input.content_id, content_type: input.content_type },
			],
		});
	} else {
		const item: LibraryItemInput = {
			content_id: input.content_id,
			content_type: input.content_type,
			name: input.name,
			poster: input.poster,
			background: input.background,
			description: input.description,
			release_info: input.release_info,
			imdb_rating: input.imdb_rating,
			genres: input.genres,
			added_at: Date.now(),
		};
		await nuvio.library.upsertItems({
			p_profile_id: profileId,
			p_origin_client_id: ORIGIN_CLIENT_ID,
			p_items: [item],
		});
	}

	await Promise.all([libraryIds().refresh(), libraryItems().refresh()]);
	return { inLibrary: !input.remove };
});
