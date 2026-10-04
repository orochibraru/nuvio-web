import { m } from "#lib/i18n/index.js";
/** The optional native multi-audio-track API, absent in many browsers. */
export interface NativeAudioTrack {
	label: string;
	language: string;
	enabled: boolean;
}
export interface NativeAudioTrackList {
	readonly length: number;
	[index: number]: NativeAudioTrack;
	addEventListener: (type: string, listener: () => void) => void;
	removeEventListener: (type: string, listener: () => void) => void;
}
export type VideoWithAudioTracks = HTMLVideoElement & {
	audioTracks?: NativeAudioTrackList;
};

export interface AudioTrackOption {
	id: number;
	label: string;
	/** As the source spells it (`fr`, `fre`, …), or empty when it doesn't say. */
	language: string;
}

export function nativeAudioSnapshot(list: NativeAudioTrackList): {
	tracks: AudioTrackOption[];
	active: number;
} {
	const tracks: AudioTrackOption[] = [];
	let active = -1;
	for (let index = 0; index < list.length; index++) {
		const track = list[index];
		tracks.push({
			id: index,
			label:
				track.label ||
				track.language ||
				m.player_audio_track_fallback({ number: index + 1 }),
			language: track.language,
		});
		if (track.enabled) {
			active = index;
		}
	}
	return { tracks, active };
}

/** Wires the native `audioTracks` list, if the browser exposes one for this
 *  element, to `onChange` : called once immediately, then on every list
 *  change. Returns a cleanup, or `undefined` when there's no such list
 *  (browsers without native audio-track selection). */
export function attachNativeAudioTracks(
	el: VideoWithAudioTracks,
	onChange: (tracks: AudioTrackOption[], active: number) => void,
): (() => void) | undefined {
	const list = el.audioTracks;
	if (!list) {
		return undefined;
	}
	const sync = () => {
		const snapshot = nativeAudioSnapshot(list);
		onChange(snapshot.tracks, snapshot.active);
	};
	list.addEventListener("addtrack", sync);
	list.addEventListener("removetrack", sync);
	list.addEventListener("change", sync);
	sync();
	return () => {
		list.removeEventListener("addtrack", sync);
		list.removeEventListener("removetrack", sync);
		list.removeEventListener("change", sync);
	};
}
