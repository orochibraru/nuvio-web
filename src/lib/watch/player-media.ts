/** The native multi-audio-track API : real in Chromium/Firefox for a file
 *  that muxes more than one audio track, but missing from lib.dom's types. */
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

export function nativeAudioSnapshot(list: NativeAudioTrackList): {
	tracks: Array<{ id: number; label: string }>;
	active: number;
} {
	const tracks: Array<{ id: number; label: string }> = [];
	let active = -1;
	for (let index = 0; index < list.length; index++) {
		const track = list[index];
		tracks.push({
			id: index,
			label: track.label || track.language || `Track ${index + 1}`,
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
 *  (Safari, or a single-track file). */
export function attachNativeAudioTracks(
	el: VideoWithAudioTracks,
	onChange: (
		tracks: Array<{ id: number; label: string }>,
		active: number,
	) => void,
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
