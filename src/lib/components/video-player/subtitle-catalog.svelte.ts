import { languageName } from "#lib/watch/player-format.js";
import { createSubtitleTracks } from "#lib/watch/subtitle-tracks.svelte.js";
import type { SubtitleTrack } from "./types.js";

const trackKey = (track: SubtitleTrack, index: number): string =>
	track.id ?? `${track.lang}:${index}`;

/**
 * The list of subtitle tracks on offer, and their WebVTT blobs resolved on
 * demand. `<track>` elements themselves stay in the caller's template (they
 * must be children of `<video>`), so this only exposes `options` / `ready` /
 * `failed` for that loop to render from, plus `resolve` to fetch one.
 */
export function createSubtitleCatalog(deps: { tracks: () => SubtitleTrack[] }) {
	const options = $derived(
		deps.tracks().map((track, index) => ({
			...track,
			key: trackKey(track, index),
			name: languageName(track.lang),
		})),
	);

	// Subtitle files are fetched + converted to WebVTT in the browser, on
	// demand : never proxied through the server.
	const subs = createSubtitleTracks(() => options);

	return {
		get options() {
			return options;
		},
		get ready() {
			return subs.ready;
		},
		get failed() {
			return subs.failed;
		},
		resolve: subs.resolve,
	};
}

export type SubtitleCatalog = ReturnType<typeof createSubtitleCatalog>;
