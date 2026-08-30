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

/**
 * Everything the streams / player screens need *except* the streams themselves —
 * so the page can paint instantly while `resolveStreams` fans out in the client.
 */
export const playbackContext = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { client } = await getAddonClient();
		const { nuvio, profileId } = requireProfile();
		const { contentId, season, episode } = parseVideoId(type, id);
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
			logo: meta?.logo ?? null,
			certification:
				meta?.certification ??
				(meta?.behaviorHints?.adult ? "18+" : null) ??
				null,
			genres: meta?.genres ?? [],
			next,
			resume:
				progress && progress.duration > 0 && progress.position > 5000
					? { position: progress.position, duration: progress.duration }
					: null,
		};
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
				url: stream.url ?? null,
				externalUrl: stream.externalUrl ?? null,
				notWebReady: Boolean(stream.behaviorHints?.notWebReady),
				name: stream.name ?? null,
				title: stream.title ?? null,
				description: stream.description ?? null,
				addonName: stream.addonName,
				fileSize: stream.behaviorHints?.videoSize ?? null,
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

	const rows = await nuvio.watchProgress.pull({
		p_profile_id: profileId,
		p_limit: 30,
	});
	const seen = new Set<string>();
	const inProgress = rows
		.filter(
			(row) =>
				row.duration > 60_000 &&
				row.position < row.duration * 0.9 &&
				row.position > 30_000,
		)
		.sort((a, b) => b.last_watched - a.last_watched)
		// One entry per title — the most recently watched episode wins.
		.filter((row) => {
			if (seen.has(row.content_id)) {
				return false;
			}
			seen.add(row.content_id);
			return true;
		})
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
				remainingMs: Math.max(0, row.duration - row.position),
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
