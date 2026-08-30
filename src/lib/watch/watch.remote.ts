import * as v from "valibot";
import { query } from "$app/server";
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

		// Next episode in play order, for autoplay / "up next".
		let next: {
			videoId: string;
			label: string;
			thumbnail: string | null;
		} | null = null;
		if (
			type === "series" &&
			season != null &&
			episode != null &&
			meta?.videos
		) {
			const ordered = [...meta.videos]
				.filter((entry) => (entry.season ?? 0) > 0)
				.sort(
					(a, b) =>
						(a.season ?? 0) - (b.season ?? 0) ||
						(a.episode ?? 0) - (b.episode ?? 0),
				);
			const index = ordered.findIndex(
				(entry) => entry.season === season && entry.episode === episode,
			);
			const candidate = index >= 0 ? ordered[index + 1] : undefined;
			if (candidate) {
				next = {
					videoId: candidate.id,
					label: `S${candidate.season}E${candidate.episode} · ${candidate.title}`,
					thumbnail: candidate.thumbnail ?? null,
				};
			}
		}

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
			next,
			resume:
				progress && progress.duration > 0 && progress.position > 5000
					? { position: progress.position, duration: progress.duration }
					: null,
		};
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
				poster: meta?.meta.poster ?? null,
				background: meta?.meta.background ?? meta?.meta.poster ?? null,
				logo: meta?.meta.logo ?? null,
				videoId: row.video_id,
				season: row.season,
				episode: row.episode,
				progress: row.position / row.duration,
			};
		}),
	);

	return items;
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
