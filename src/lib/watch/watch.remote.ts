import * as v from "valibot";
import { getAddonClient, titleMeta } from "#lib/addons/server.js";
import { httpUrlOrNull } from "#lib/core/url.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import { pullPlaybackMeta } from "./watch-data.ts";

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
			streams: streams.map((stream, index) => ({
				index,
				url: httpUrlOrNull(stream.url),
				externalUrl: httpUrlOrNull(stream.externalUrl),
				notWebReady: Boolean(stream.behaviorHints?.notWebReady),
				name: stream.name ?? null,
				title: stream.title ?? null,
				description: stream.description ?? null,
				addonName: stream.addonName,
				fileSize: stream.behaviorHints?.videoSize ?? null,
				infoHash: stream.infoHash ?? null,
				filename: stream.behaviorHints?.filename ?? null,
			})),
			errors: errors.map((entry) => ({
				addonName: entry.addonName,
				message: entry.message,
			})),
		};
	},
);

const SDH_MARKER = /\b(sdh|cc|hi|hearing[- ]impaired)\b|\[cc\]/i;

export const getSubtitles = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { subtitles } = await client.getSubtitles(type, id);

		// Keep every option (one per source), not one per language : the overlay
		// lets the viewer pick the exact release. Drop only exact URL duplicates.
		const seen = new Set<string>();
		const options: Array<{
			id: string;
			lang: string;
			url: string;
			addonName: string;
			sdh: boolean;
		}> = [];
		for (const subtitle of subtitles) {
			if (!subtitle.url || seen.has(subtitle.url)) {
				continue;
			}
			seen.add(subtitle.url);
			options.push({
				id: `${subtitle.addonId}:${subtitle.id || options.length}`,
				lang: subtitle.lang,
				url: subtitle.url,
				addonName: subtitle.addonName,
				sdh: SDH_MARKER.test(`${subtitle.lang} ${subtitle.id}`),
			});
		}
		return options;
	},
);
