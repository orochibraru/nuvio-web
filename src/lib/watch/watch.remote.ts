import * as v from "valibot";
import { getAddonClient, titleMeta } from "#lib/addons/server.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import { pullPlaybackMeta, pullSubtitles, shapeStream } from "./watch-data.ts";

/**
 * A video's meta context (heading, art, episode tag) for the source drawer,
 * which opens on a user gesture for any video. The player page gets the same
 * payload from its load.
 */
export const playbackMeta = query(
	v.object({ type: v.string(), id: v.string() }),
	({ type, id }) => {
		requireProfile();
		return pullPlaybackMeta(
			{ type, id },
			async (metaType: string, metaId: string) =>
				(await titleMeta(metaType, metaId))?.meta ?? null,
		);
	},
);

/**
 * Fan out to every stream provider for this title. Slow and best-effort : called
 * from the client with `.current` (skeleton) and re-run by a "Refresh" button.
 */
export const resolveStreams = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { streams, errors } = await client.getStreams(type, id);
		return {
			streams: streams.map(shapeStream),
			errors: errors.map((entry) => ({
				addonName: entry.addonName,
				reason: entry.reason,
			})),
		};
	},
);

export const getSubtitles = query(
	v.object({ type: v.string(), id: v.string() }),
	async (video) => pullSubtitles((await getAddonClient()).client, video),
);
