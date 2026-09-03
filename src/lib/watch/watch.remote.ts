import * as v from "valibot";
import { getAddonClient, titleMeta } from "#lib/addons/server.js";
import { httpUrlOrNull } from "#lib/core/url.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import { pullPlaybackContext } from "./watch-data.ts";

/**
 * The player page gets its context from the load; this is the client-initiated
 * path : the detail page's stream panel and its hover prefetch, which ask for
 * another video's context than the one the load resolved.
 */
export const playbackContext = query(
	v.object({ type: v.string(), id: v.string() }),
	({ type, id }) => {
		const { nuvio, profileId } = requireProfile();
		return pullPlaybackContext(
			nuvio,
			profileId,
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

/** Progress for every video of one title, keyed by `video_id`. Powers resume bars. */
export const titleProgress = query(
	v.object({ contentId: v.string() }),
	async ({ contentId }) => {
		const { nuvio, profileId } = requireProfile();
		const rows = await nuvio.watchProgress.pull({
			p_profile_id: profileId,
			p_limit: 500,
		});
		const byVideo: Record<string, { fraction: number; completed: boolean }> =
			{};
		for (const row of rows) {
			if (row.content_id !== contentId || row.duration <= 0) {
				continue;
			}
			const fraction = Math.min(1, row.position / row.duration);
			byVideo[row.video_id] = {
				fraction,
				completed: fraction >= 0.9 && row.duration >= 60_000,
			};
		}
		return byVideo;
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
