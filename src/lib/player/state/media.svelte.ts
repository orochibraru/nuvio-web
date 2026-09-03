import Hls from "hls.js";
import {
	attachNativeAudioTracks,
	type VideoWithAudioTracks,
} from "#lib/player/media.js";

interface MediaDeps {
	src: () => string;
	video: () => HTMLVideoElement | null;
	/** New source: the component clears its own playback flags here. */
	onLoad: () => void;
	onFatal: (message: string) => void;
}

/**
 * Attach a source to the `<video>` : hls.js for `.m3u8`, a plain `src`
 * otherwise : and expose an audio-track list for the settings menu. HLS
 * multi-language streams come from hls.js's own track list; a direct file
 * (mp4/mkv/…) that muxes more than one audio track comes from the browser's
 * native `HTMLMediaElement.audioTracks` instead (see `attachNativeAudioTracks`
 * in `player-media.ts`) : Chromium and Firefox both populate it, Safari
 * doesn't, so a single-track or unsupported source just never grows past the
 * empty list and the settings menu hides that section. Tears the HLS
 * instance / native listeners down and clears the element `src` when the
 * source changes or the component unmounts.
 */
export function createPlayerMedia(deps: MediaDeps) {
	let hls = $state<Hls | null>(null);
	let audioTracks = $state<Array<{ id: number; label: string }>>([]);
	let activeAudioTrack = $state(-1);

	$effect(() => {
		const el = deps.video();
		const src = deps.src();
		if (!(el && src)) {
			return;
		}
		deps.onLoad();
		audioTracks = [];
		activeAudioTrack = -1;

		if (src.toLowerCase().includes(".m3u8") && Hls.isSupported()) {
			const instance = new Hls({ maxBufferLength: 30 });
			hls = instance;
			instance.loadSource(src);
			instance.attachMedia(el);
			instance.on(Hls.Events.ERROR, (_event, data) => {
				if (data.fatal) {
					deps.onFatal("This stream could not be played.");
				}
			});
			const syncAudio = () => {
				audioTracks = instance.audioTracks.map((track, index) => ({
					id: index,
					label: track.name || track.lang || `Track ${index + 1}`,
				}));
				activeAudioTrack = instance.audioTrack;
			};
			instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudio);
			instance.on(Hls.Events.AUDIO_TRACK_SWITCHED, syncAudio);
			return () => {
				instance.destroy();
				hls = null;
			};
		}

		el.src = src;
		el.load();
		const cleanupNative = attachNativeAudioTracks(
			el as VideoWithAudioTracks,
			(tracks, active) => {
				audioTracks = tracks;
				activeAudioTrack = active;
			},
		);

		return () => {
			cleanupNative?.();
			el.removeAttribute("src");
			el.load();
		};
	});

	return {
		get hls() {
			return hls;
		},
		get audioTracks() {
			return audioTracks;
		},
		get activeAudioTrack() {
			return activeAudioTrack;
		},
		set activeAudioTrack(value: number) {
			activeAudioTrack = value;
		},
		/** From the settings menu : switch and close is the caller's job. */
		selectAudioTrack(id: number) {
			if (hls) {
				hls.audioTrack = id;
				activeAudioTrack = id;
				return;
			}
			const nativeTracks = (deps.video() as VideoWithAudioTracks | null)
				?.audioTracks;
			if (!nativeTracks) {
				return;
			}
			for (let index = 0; index < nativeTracks.length; index++) {
				nativeTracks[index].enabled = index === id;
			}
			activeAudioTrack = id;
		},
	};
}
