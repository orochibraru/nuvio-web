import type Hls from "hls.js";
import { m } from "#lib/i18n/index.js";
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

type AudioTrackList = Array<{ id: number; label: string }>;

interface AttachHooks {
	onFatal: (message: string) => void;
	onAudio: (tracks: AudioTrackList, active: number) => void;
	onHls: (instance: Hls | null) => void;
}

/** A plain `src`: a direct file, or HLS the browser plays itself (Safari). */
function attachNative(el: HTMLVideoElement, src: string, hooks: AttachHooks) {
	el.src = src;
	el.load();
	const cleanupNative = attachNativeAudioTracks(
		el as VideoWithAudioTracks,
		hooks.onAudio,
	);
	return () => {
		cleanupNative?.();
		el.removeAttribute("src");
		el.load();
	};
}

/**
 * An HLS source through hls.js, which is ~190 KB gzip while most streams are
 * mp4/mkv : so it's imported here, on demand. The source can change, or the
 * player unmount, while the chunk downloads: the returned cleanup cancels a
 * late arrival as well as tearing down a live instance.
 */
function attachHls(el: HTMLVideoElement, src: string, hooks: AttachHooks) {
	let cancelled = false;
	let cleanup: (() => void) | undefined;
	import("hls.js")
		.then(({ default: HlsClass }) => {
			if (cancelled) {
				return;
			}
			if (!HlsClass.isSupported()) {
				cleanup = attachNative(el, src, hooks);
				return;
			}
			const instance = new HlsClass({ maxBufferLength: 30 });
			instance.loadSource(src);
			instance.attachMedia(el);
			instance.on(HlsClass.Events.ERROR, (_event, data) => {
				if (data.fatal) {
					hooks.onFatal(m.player_error_stream());
				}
			});
			const syncAudio = () =>
				hooks.onAudio(
					instance.audioTracks.map((track, index) => ({
						id: index,
						label:
							track.name ||
							track.lang ||
							m.player_audio_track_fallback({ number: index + 1 }),
					})),
					instance.audioTrack,
				);
			instance.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, syncAudio);
			instance.on(HlsClass.Events.AUDIO_TRACK_SWITCHED, syncAudio);
			hooks.onHls(instance);
			cleanup = () => {
				instance.destroy();
				hooks.onHls(null);
			};
		})
		.catch(() => {
			// The chunk failed to load (offline, a new deploy): let the browser try.
			if (!cancelled) {
				cleanup = attachNative(el, src, hooks);
			}
		});
	return () => {
		cancelled = true;
		cleanup?.();
	};
}

/**
 * Attach a source to the `<video>` : hls.js (loaded on demand) for `.m3u8`, a
 * plain `src` otherwise : and expose an audio-track list for the settings
 * menu. HLS multi-language streams come from hls.js's own track list; a direct
 * file (mp4/mkv/…) that muxes more than one audio track comes from the
 * browser's native `HTMLMediaElement.audioTracks` instead (see
 * `attachNativeAudioTracks` in `player-media.ts`) : Chromium and Firefox both
 * populate it, Safari doesn't, so a single-track or unsupported source just
 * never grows past the empty list and the settings menu hides that section.
 * Tears the HLS instance / native listeners down and clears the element `src`
 * when the source changes or the component unmounts.
 */
export function createPlayerMedia(deps: MediaDeps) {
	let hls = $state<Hls | null>(null);
	let audioTracks = $state<AudioTrackList>([]);
	let activeAudioTrack = $state(-1);

	const hooks: AttachHooks = {
		onFatal: (message) => deps.onFatal(message),
		onAudio: (tracks, active) => {
			audioTracks = tracks;
			activeAudioTrack = active;
		},
		onHls: (instance) => {
			hls = instance;
		},
	};

	$effect(() => {
		const el = deps.video();
		const src = deps.src();
		if (!(el && src)) {
			return;
		}
		deps.onLoad();
		audioTracks = [];
		activeAudioTrack = -1;
		return src.toLowerCase().includes(".m3u8")
			? attachHls(el, src, hooks)
			: attachNative(el, src, hooks);
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
