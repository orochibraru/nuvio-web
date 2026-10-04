import type Hls from "hls.js";
import { m } from "#lib/i18n/index.js";
import { preferredTrackIndex } from "#lib/player/audio-language.js";
import {
	type AudioTrackOption,
	attachNativeAudioTracks,
	type VideoWithAudioTracks,
} from "#lib/player/media.js";
import type {
	AudioPreference,
	TransmuxReason,
	TransmuxSession,
} from "#lib/player/transmux-session.js";

interface MediaDeps {
	src: () => string;
	video: () => HTMLVideoElement | null;
	/** New source: the component clears its own playback flags here. */
	onLoad: () => void;
	onFatal: (message: string) => void;
	/** The track to start on, applied once a source shows more than one. */
	audioPreference: () => AudioPreference;
}

type AudioTrackList = AudioTrackOption[];

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
						language: track.lang ?? "",
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

/** False when the element has no native track list to switch in. */
function enableNativeTrack(el: HTMLVideoElement | null, id: number) {
	const tracks = (el as VideoWithAudioTracks | null)?.audioTracks;
	if (!tracks) {
		return false;
	}
	for (let index = 0; index < tracks.length; index++) {
		tracks[index].enabled = index === id;
	}
	return true;
}

/**
 * The in-browser fix : the file re-muxed through MSE, its audio decoded in WASM
 * and re-encoded to stereo when the browser can't. See `transmux-session.ts`.
 */
function attachTransmux(
	el: HTMLVideoElement,
	fix: AudioFix,
	hooks: AttachHooks,
) {
	hooks.onAudio(fix.session.audioTracks, fix.session.activeAudioTrack);
	return fix.session.attach(el, fix.resumeAt, hooks.onFatal);
}

interface AudioFix {
	src: string;
	session: TransmuxSession;
	resumeAt: number;
}

/**
 * Owns the swap to the transmux pipeline : `request()` probes the source and,
 * when it can be fixed, publishes the session `active` hands to the attach
 * effect. One probe per source at a time.
 */
function createSourceFix(
	deps: Pick<MediaDeps, "src" | "video" | "audioPreference">,
) {
	let fix = $state.raw<AudioFix | null>(null);
	let probing: { src: string; result: Promise<boolean> } | null = null;

	async function probe(
		src: string,
		el: HTMLVideoElement,
		reason: TransmuxReason,
	) {
		const session = await import("#lib/player/transmux-session.js")
			.then(({ prepareTransmux }) =>
				prepareTransmux(src, reason, deps.audioPreference()),
			)
			.catch(() => null);
		if (!session) {
			return false;
		}
		if (deps.src() !== src || deps.video() !== el) {
			session.dispose();
			return false;
		}
		fix = { src, session, resumeAt: el.currentTime };
		return true;
	}

	const active = () =>
		fix?.src === deps.src() && !fix.session.disposed ? fix : null;

	return {
		/** The live fix for the current source, if any. */
		get active() {
			return active();
		},
		/** False when this source can't be fixed, or already runs fixed. */
		request(reason: TransmuxReason): Promise<boolean> {
			const el = deps.video();
			const src = deps.src();
			if (!(el && src) || src.toLowerCase().includes(".m3u8") || active()) {
				return Promise.resolve(false);
			}
			if (probing?.src === src) {
				return probing.result;
			}
			const result = probe(src, el, reason).finally(() => {
				probing = null;
			});
			probing = { src, result };
			return result;
		},
	};
}

/**
 * Attach a source to the `<video>` : hls.js (loaded on demand) for `.m3u8`, a
 * plain `src` otherwise : and expose an audio-track list for the settings
 * menu. HLS multi-language streams come from hls.js's own track list; a direct
 * file (mp4/mkv/…) that muxes more than one audio track comes from the
 * browser's native `HTMLMediaElement.audioTracks` instead (see
 * `attachNativeAudioTracks` in `media.ts`). Browsers without that API use the
 * transmux pipeline for supported multi-track direct files. A single-track
 * or unsupported source does not expose a choice in the settings menu.
 * `fix()` swaps a direct file the browser can't play as is (undecodable audio,
 * refused container) over to the transmux pipeline at the current position,
 * when the host allows it.
 * Tears the HLS instance / native listeners down and clears the element `src`
 * when the source changes or the component unmounts.
 */
export function createPlayerMedia(deps: MediaDeps) {
	let hls = $state<Hls | null>(null);
	let audioTracks = $state<AudioTrackList>([]);
	let activeAudioTrack = $state(-1);
	const sourceFix = createSourceFix(deps);
	let preferenceApplied = false;

	function selectAudioTrack(id: number) {
		const fix = sourceFix.active;
		if (fix) {
			fix.session.selectAudioTrack(id);
		} else if (hls) {
			hls.audioTrack = id;
		} else if (!enableNativeTrack(deps.video(), id)) {
			return;
		}
		activeAudioTrack = id;
	}

	/** Once per source, as soon as it shows a choice of tracks. */
	function applyPreference(tracks: AudioTrackList, active: number) {
		if (preferenceApplied || tracks.length < 2) {
			return;
		}
		preferenceApplied = true;
		const { languages, track } = deps.audioPreference();
		const wanted =
			track !== null && tracks[track]
				? track
				: preferredTrackIndex(tracks, languages);
		if (wanted !== -1 && wanted !== active) {
			selectAudioTrack(wanted);
		}
	}

	const hooks: AttachHooks = {
		onFatal: (message) => deps.onFatal(message),
		onAudio: (tracks, active) => {
			audioTracks = tracks;
			activeAudioTrack = active;
			applyPreference(tracks, active);
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
		// Same source, new pipeline : playback state carries over.
		const fix = sourceFix.active;
		if (fix) {
			return attachTransmux(el, fix, hooks);
		}
		deps.onLoad();
		audioTracks = [];
		activeAudioTrack = -1;
		preferenceApplied = false;
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
		/** From the audio menu : switch and close is the caller's job. */
		selectAudioTrack,
		/** The fix is running and its audio is converted, not copied. */
		get convertingAudio() {
			return Boolean(sourceFix.active?.session.converting);
		},
		fix: sourceFix.request,
	};
}
