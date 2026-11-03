import { getLocale, m } from "#lib/i18n/index.js";
import { languageName } from "#lib/player/format.js";
import type { SubtitleOption, SubtitleTrack } from "#lib/player/types.js";
import { createSubtitleTracks } from "./subtitle-tracks.svelte.ts";

const trackKey = (track: SubtitleTrack, index: number): string =>
	track.id ?? `${track.lang}:${index}`;

export const isSubtitleKind = (track: TextTrack): boolean =>
	track.kind === "subtitles" || track.kind === "captions";

interface EmbeddedTrack {
	option: SubtitleOption;
	track: TextTrack;
}

// Text tracks the stream carries itself (HLS renditions, a file's own, the remux path's), keyed per TextTrack.
function createEmbeddedTracks(video: () => HTMLVideoElement | null) {
	const embeddedKeys = new WeakMap<TextTrack, string>();
	let embeddedCount = 0;
	let embedded = $state.raw<EmbeddedTrack[]>([]);

	function embeddedEntry(track: TextTrack): EmbeddedTrack {
		let key = embeddedKeys.get(track);
		if (!key) {
			embeddedCount += 1;
			key = `embedded:${embeddedCount}`;
			embeddedKeys.set(track, key);
		}
		return {
			track,
			option: {
				key,
				lang: track.language,
				url: "",
				name: track.language
					? languageName(track.language, getLocale())
					: m.player_subtitle_embedded(),
				addonName: track.label || undefined,
				embedded: true,
			},
		};
	}

	$effect(() => {
		const element = video();
		if (!element) {
			return;
		}
		const list = element.textTracks;
		const sync = () => {
			const ours = new Set(
				Array.from(
					element.querySelectorAll<HTMLTrackElement>("track[data-addon]"),
					(node) => node.track,
				),
			);
			embedded = Array.from(list)
				.filter((track) => isSubtitleKind(track) && !ours.has(track))
				.map(embeddedEntry);
		};
		sync();
		list.addEventListener("addtrack", sync);
		list.addEventListener("removetrack", sync);
		return () => {
			list.removeEventListener("addtrack", sync);
			list.removeEventListener("removetrack", sync);
			embedded = [];
		};
	});

	return {
		get list() {
			return embedded;
		},
		keyOf: (track: TextTrack) => embeddedKeys.get(track) ?? null,
	};
}

/**
 * The list of subtitle tracks on offer, and their WebVTT blobs resolved on
 * demand. `<track>` elements themselves stay in the caller's template (they
 * must be children of `<video>`), so this only exposes `options` / `ready` /
 * `failed` for that loop to render from, plus `resolve` to fetch one.
 * The stream's own text tracks are listed first.
 */
export function createSubtitleCatalog(deps: {
	tracks: () => SubtitleTrack[];
	video: () => HTMLVideoElement | null;
}) {
	const addonOptions = $derived(
		deps.tracks().map((track, index) => ({
			...track,
			key: trackKey(track, index),
			name: languageName(track.lang, getLocale()),
		})),
	);

	// Subtitle files are fetched + converted to WebVTT in the browser, on
	// demand : never proxied through the server.
	const subs = createSubtitleTracks(() => addonOptions);

	const embedded = createEmbeddedTracks(deps.video);

	const options = $derived([
		...embedded.list.map((entry) => entry.option),
		...addonOptions,
	]);

	function textTrack(key: string): TextTrack | null {
		const found = embedded.list.find((entry) => entry.option.key === key);
		if (found) {
			return found.track;
		}
		const tracks = Array.from(deps.video()?.textTracks ?? []);
		return (
			tracks.find((track) => track.label === key && !embedded.keyOf(track)) ??
			null
		);
	}

	function keyOf(track: TextTrack): string | null {
		return (
			embedded.keyOf(track) ??
			(addonOptions.some((option) => option.key === track.label)
				? track.label
				: null)
		);
	}

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
		resolve: (key: string) =>
			embedded.list.some((entry) => entry.option.key === key)
				? Promise.resolve(true)
				: subs.resolve(key),
		textTrack,
		keyOf,
	};
}

export type SubtitleCatalog = ReturnType<typeof createSubtitleCatalog>;
