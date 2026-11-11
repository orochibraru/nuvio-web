import { preferredTrackIndex } from "./audio-language.ts";
import type { EngineTrack } from "./desktop-mpv.ts";
import { languageMatches, languageName } from "./format.ts";
import { audioTrackLabel } from "./transmux.ts";
import type { SubtitleOption, SubtitleTrack } from "./types.ts";

const EMBEDDED = "mpv:";
const ADDON = "addon:";

/** The subtitle picker's options over mpv: the file's own tracks, then the addon's. */
export function engineSubtitleOptions(
	tracks: readonly EngineTrack[],
	addon: readonly SubtitleTrack[],
	locale: string,
	trackName: (number: number) => string,
): SubtitleOption[] {
	const own = tracks
		.filter((track) => track.type === "sub" && track.external === null)
		.map((track, index) => ({
			key: `${EMBEDDED}${track.id}`,
			lang: track.lang,
			url: "",
			embedded: true,
			name:
				track.title ||
				(track.lang ? languageName(track.lang, locale) : trackName(index + 1)),
		}));
	const seen = new Set<string>();
	const added = addon
		.filter((track) => {
			const fresh = /^https?:\/\//i.test(track.url) && !seen.has(track.url);
			seen.add(track.url);
			return fresh;
		})
		.map((track) => ({
			...track,
			key: `${ADDON}${track.url}`,
			name: languageName(track.lang, locale),
		}));
	return [...own, ...added];
}

/** The picker key of the subtitle mpv shows, or null. */
export function activeEngineCaption(
	tracks: readonly EngineTrack[],
): string | null {
	const shown = tracks.find((track) => track.type === "sub" && track.selected);
	if (!shown) {
		return null;
	}
	return shown.external === null
		? `${EMBEDDED}${shown.id}`
		: `${ADDON}${shown.external}`;
}

/** What to ask mpv for a picker key (`null` turns subtitles off). */
export function engineCaptionCommand(
	key: string | null,
	options: readonly SubtitleOption[],
):
	| { op: "subtitle"; id: number | null }
	| { op: "subtitle-add"; url: string; lang: string }
	| null {
	if (key === null) {
		return { op: "subtitle", id: null };
	}
	if (key.startsWith(EMBEDDED)) {
		return { op: "subtitle", id: Number(key.slice(EMBEDDED.length)) };
	}
	const option = options.find((entry) => entry.key === key);
	return option
		? { op: "subtitle-add", url: option.url, lang: option.lang }
		: null;
}

/** The audio menu's tracks: their own name, else their language. */
export function engineAudioTracks(
	tracks: readonly EngineTrack[],
	trackName: (number: number) => string,
): Array<{ id: number; label: string; selected: boolean }> {
	return tracks
		.filter((track) => track.type === "audio")
		.map((track, index) => ({
			id: track.id,
			label: audioTrackLabel(
				{ name: track.title || null, languageCode: track.lang },
				trackName(index + 1),
			),
			selected: track.selected,
		}));
}

/** The audio track the viewer's languages want, if it isn't the one playing. */
export function preferredEngineAudio(
	tracks: readonly EngineTrack[],
	targets: readonly string[],
): number | null {
	const audio = tracks.filter((track) => track.type === "audio");
	const index = preferredTrackIndex(
		audio.map((track) => ({ language: track.lang })),
		targets,
	);
	const wanted = audio[index];
	return wanted && !wanted.selected ? wanted.id : null;
}

/** The subtitle in the viewer's language, the file's own first, or null. */
export function preferredEngineCaption(
	options: readonly SubtitleOption[],
	language: string,
): string | null {
	if (!language) {
		return null;
	}
	return (
		options.find((option) => languageMatches(option.lang, language))?.key ??
		null
	);
}
