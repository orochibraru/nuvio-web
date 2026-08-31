import * as v from "valibot";
import { getAddonClient } from "#lib/addons/server.js";
import { requireProfile } from "#lib/server/guards.js";
import { httpUrlOrNull } from "#lib/utils.js";
import { query } from "$app/server";
import { nextEpisode } from "./episodes.ts";
import { assemblePlaybackContext, parseVideoId } from "./playback-context.ts";

/**
 * Everything the streams / player screens need *except* the streams themselves —
 * so the page can paint instantly while `resolveStreams` fans out in the client.
 */
export const playbackContext = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { nuvio, profileId } = requireProfile();
		const { contentId } = parseVideoId(type, id);
		const metaType: "movie" | "series" = type === "series" ? "series" : "movie";

		// Both are best-effort: a missing addon or a hiccup on the progress pull
		// must not stop the streams / player screens from painting.
		const [metaResult, progressRows] = await Promise.all([
			client.getMeta(metaType, contentId).catch(() => null),
			nuvio.watchProgress
				.pull({ p_profile_id: profileId })
				.catch(
					() => [] as Awaited<ReturnType<typeof nuvio.watchProgress.pull>>,
				),
		]);

		return assemblePlaybackContext({
			type,
			id,
			meta: metaResult?.meta,
			progressRows,
		});
	},
);

/**
 * Fan out to every stream provider for this title. Slow and best-effort — called
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

export const continueWatching = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const { client } = await getAddonClient();

	// A hiccup on the progress pull must not blank the whole home page — the
	// local store still fills the row on the client.
	const rows = await nuvio.watchProgress
		.pull({ p_profile_id: profileId, p_limit: 30 })
		.catch(() => [] as Awaited<ReturnType<typeof nuvio.watchProgress.pull>>);
	// Most-recent row per title (completed or not — a finished episode of a
	// running show still points at the next one to watch).
	const seen = new Set<string>();
	const latestPerTitle = rows
		.filter((row) => row.duration > 60_000)
		.sort((a, b) => b.last_watched - a.last_watched)
		.filter((row) => {
			if (seen.has(row.content_id)) {
				return false;
			}
			seen.add(row.content_id);
			return true;
		})
		.slice(0, 16);

	const items = (
		await Promise.all(
			latestPerTitle.map(async (row) => {
				const meta = await client
					.getMeta(row.content_type, row.content_id)
					.catch(() => null);
				const base = {
					id: row.content_id,
					type: row.content_type,
					name: meta?.meta.name ?? row.content_id,
					poster: meta?.meta.poster ?? null,
					background: meta?.meta.background ?? meta?.meta.poster ?? null,
					logo: meta?.meta.logo ?? null,
				};

				const complete = row.position >= row.duration * 0.9;

				// Still mid-episode → resume it.
				if (!complete) {
					return {
						...base,
						videoId: row.video_id,
						season: row.season,
						episode: row.episode,
						progress: row.position / row.duration,
						remainingMs: Math.max(0, row.duration - row.position),
					};
				}

				// Finished. For a series, roll forward to the next episode.
				if (row.content_type === "series" && meta?.meta.videos) {
					const next = nextEpisode(meta.meta.videos, row.season, row.episode);
					if (next) {
						return {
							...base,
							videoId: `${row.content_id}:${next.season}:${next.episode}`,
							season: next.season,
							episode: next.episode,
							progress: 0,
							remainingMs: 0,
						};
					}
				}

				// Finished movie, or last episode of the show — drop it.
				return null;
			}),
		)
	).filter((item): item is NonNullable<typeof item> => item !== null);

	return items.slice(0, 12);
});

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

		// Keep every option (one per source), not one per language — the overlay
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
