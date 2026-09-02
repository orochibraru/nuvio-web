import type { Meta } from "#lib/addons/index.js";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { pooledMap } from "#lib/pool.js";
import { nextEpisode } from "./episodes.ts";
import { assemblePlaybackContext, parseVideoId } from "./playback-context.ts";

// Each row fans out to every meta-providing addon inside `getMeta`; an
// unbounded pass over up to 16 rows could burst 30-50+ concurrent requests
// at a shared addon like Cinemeta, time some out, and leave those cards
// showing a bare content id for a name.
const CONTINUE_WATCHING_CONCURRENCY = 4;

/** Injected rather than imported so this module stays free of `$app/server`
 *  (and unit-testable) — the load passes `AddonClient`'s own lookup. */
export type MetaLookup = (type: string, id: string) => Promise<Meta | null>;

/** A continue-watching card before any addon meta is attached. */
export interface ResumeRow {
	id: string;
	type: "movie" | "series";
	name: string;
	poster: string | null;
	background: string | null;
	logo: string | null;
	videoId: string;
	season: number | null;
	episode: number | null;
	progress: number;
	remainingMs: number;
}

/**
 * Raw in-progress rows for the home "continue watching" row — user data only, no
 * addon calls, so the home page load never blocks on a slow provider. The page
 * enriches these (poster / name / next-episode roll-forward) from the local sync
 * store and the client-side `continueWatching` query.
 */
export async function pullResumeRows(
	nuvio: NuvioClient,
	profileId: number,
): Promise<ResumeRow[]> {
	const rows = await nuvio.watchProgress
		.pull({ p_profile_id: profileId, p_limit: 30 })
		.catch(() => []);

	const seen = new Set<string>();
	return rows
		.filter((row) => row.duration > 60_000 && row.position < row.duration * 0.9)
		.sort((a, b) => b.last_watched - a.last_watched)
		.filter((row) => {
			if (seen.has(row.content_id)) {
				return false;
			}
			seen.add(row.content_id);
			return true;
		})
		.slice(0, 16)
		.map((row) => ({
			id: row.content_id,
			type: row.content_type,
			name: row.content_id,
			poster: null,
			background: null,
			logo: null,
			videoId: row.video_id,
			season: row.season,
			episode: row.episode,
			progress: row.position / row.duration,
			remainingMs: Math.max(0, row.duration - row.position),
		}));
}

/**
 * The continue-watching row, fully resolved: in-progress rows joined to
 * addon meta (name / art) with a finished series episode rolled forward to
 * the next one. Called from the home load (streamed, not awaited) so the
 * cards arrive named rather than showing their raw content ids until a
 * client query lands.
 */
export async function pullContinueWatching(
	nuvio: NuvioClient,
	profileId: number,
	lookupMeta: MetaLookup,
): Promise<ResumeRow[]> {
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
		await pooledMap(
			latestPerTitle,
			// Each row itself fans out to every meta-providing addon inside
			// `getMeta` — an unbounded outer `Promise.all` over up to 16 rows
			// could burst 30-50+ concurrent requests at a shared addon like
			// Cinemeta, timing some out and silently falling back to the bare
			// content id as the "name" (`row.content_id` below). Capped like
			// `AddonClient`'s own internal fan-out.
			CONTINUE_WATCHING_CONCURRENCY,
			async (row) => {
				const meta = await lookupMeta(row.content_type, row.content_id).catch(
					() => null,
				);
				const base = {
					id: row.content_id,
					type: row.content_type,
					name: meta?.name ?? row.content_id,
					poster: meta?.poster ?? null,
					background: meta?.background ?? meta?.poster ?? null,
					logo: meta?.logo ?? null,
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
				if (row.content_type === "series" && meta?.videos) {
					const next = nextEpisode(meta.videos, row.season, row.episode);
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
			},
		)
	).filter((item): item is NonNullable<typeof item> => item !== null);

	return items.slice(0, 12);
}

/**
 * Everything the player screen needs *except* the streams themselves — meta,
 * where to resume, what's next. Called from the player load (streamed), so
 * the shell paints immediately and this fills in behind it without costing a
 * second round trip. Both halves are best-effort: a missing addon or a hiccup
 * on the progress pull must not stop the player from painting.
 */
export async function pullPlaybackContext(
	nuvio: NuvioClient,
	profileId: number,
	video: { type: string; id: string },
	lookupMeta: MetaLookup,
) {
	const { type, id } = video;
	const { contentId } = parseVideoId(type, id);
	const metaType: "movie" | "series" = type === "series" ? "series" : "movie";

	const [meta, progressRows] = await Promise.all([
		lookupMeta(metaType, contentId).catch(() => null),
		nuvio.watchProgress
			.pull({ p_profile_id: profileId })
			.catch(() => [] as Awaited<ReturnType<typeof nuvio.watchProgress.pull>>),
	]);

	return assemblePlaybackContext({
		type,
		id,
		meta: meta ?? undefined,
		progressRows,
	});
}
