import * as v from "valibot";
import { command, query } from "$app/server";
import { getAddonClient } from "$lib/addons/server.js";
import { requireProfile } from "$lib/server/guards.js";

function parseVideoId(type: string, id: string) {
	if (type !== "series") {
		return { contentId: id, season: undefined, episode: undefined };
	}
	const parts = id.split(":");
	return {
		contentId: parts[0] ?? id,
		season: parts[1] ? Number(parts[1]) : undefined,
		episode: parts[2] ? Number(parts[2]) : undefined,
	};
}

function progressKey(
	contentId: string,
	season?: number,
	episode?: number,
): string {
	return season != null && episode != null
		? `${contentId}_s${season}e${episode}`
		: contentId;
}

export const watchData = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { nuvio, profileId } = requireProfile();
		const { contentId, season, episode } = parseVideoId(type, id);
		const metaType: "movie" | "series" = type === "series" ? "series" : "movie";

		const [streamResult, metaResult, progressRows] = await Promise.all([
			client.getStreams(type, id),
			client.getMeta(metaType, contentId),
			nuvio.watchProgress.pull({ p_profile_id: profileId }),
		]);

		const meta = metaResult?.meta;
		const heading = meta?.name ?? contentId;
		let subheading: string | null = null;
		if (type === "series" && season != null && episode != null) {
			const video = meta?.videos?.find(
				(entry) =>
					entry.id === id ||
					(entry.season === season && entry.episode === episode),
			);
			subheading = video
				? `S${season}E${episode} · ${video.title}`
				: `S${season}E${episode}`;
		}

		const key = progressKey(contentId, season, episode);
		const progress =
			progressRows.find((row) => row.progress_key === key) ?? null;

		return {
			metaType,
			contentId,
			season: season ?? null,
			episode: episode ?? null,
			videoId: id,
			heading,
			subheading,
			background: meta?.background ?? null,
			poster: meta?.poster ?? null,
			streams: streamResult.streams,
			streamErrors: streamResult.errors,
			resume:
				progress && progress.duration > 0 && progress.position > 5000
					? { position: progress.position, duration: progress.duration }
					: null,
		};
	},
);

export const saveProgress = command(
	v.object({
		contentId: v.string(),
		contentType: v.picklist(["movie", "series"]),
		videoId: v.string(),
		season: v.optional(v.number()),
		episode: v.optional(v.number()),
		position: v.number(),
		duration: v.number(),
	}),
	async (input) => {
		const { nuvio, profileId } = requireProfile();
		await nuvio.watchProgress.push({
			p_profile_id: profileId,
			p_entries: [
				{
					content_id: input.contentId,
					content_type: input.contentType,
					video_id: input.videoId,
					season: input.season,
					episode: input.episode,
					position: Math.round(input.position),
					duration: Math.round(input.duration),
					last_watched: Date.now(),
				},
			],
		});
		return { ok: true };
	},
);

export const continueWatching = query(async () => {
	const { nuvio, profileId } = requireProfile();
	const { client } = await getAddonClient();

	const rows = await nuvio.watchProgress.pull({
		p_profile_id: profileId,
		p_limit: 30,
	});
	const inProgress = rows
		.filter(
			(row) =>
				row.duration > 60_000 &&
				row.position < row.duration * 0.9 &&
				row.position > 30_000,
		)
		.sort((a, b) => b.last_watched - a.last_watched)
		.slice(0, 12);

	const items = await Promise.all(
		inProgress.map(async (row) => {
			const meta = await client
				.getMeta(row.content_type, row.content_id)
				.catch(() => null);
			return {
				id: row.content_id,
				type: row.content_type,
				name: meta?.meta.name ?? row.content_id,
				poster: meta?.meta.poster,
				videoId: row.video_id,
				season: row.season,
				episode: row.episode,
				progress: row.position / row.duration,
			};
		}),
	);

	return items;
});

export const getSubtitles = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { subtitles } = await client.getSubtitles(type, id);
		const byLang = new Map<string, { lang: string; url: string }>();
		for (const subtitle of subtitles) {
			if (!byLang.has(subtitle.lang)) {
				byLang.set(subtitle.lang, { lang: subtitle.lang, url: subtitle.url });
			}
		}
		return [...byLang.values()];
	},
);
