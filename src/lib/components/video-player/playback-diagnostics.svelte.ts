import { createPlayerMedia } from "#lib/watch/player-media.svelte.js";
import { createProgressReporter } from "#lib/watch/player-progress.svelte.js";
import { createSilentAudioWatch } from "#lib/watch/silent-audio.svelte.js";
import { createVideoDecodeWatch } from "#lib/watch/video-decode.svelte.js";
import type { PlayerTransportState } from "./player-transport-state.svelte.js";

/**
 * Wires up the source-attachment, progress-reporting, and the two non-fatal
 * "this stream might be broken" watchers together — see each of those for
 * what they actually own. Bundled here purely to keep the caller's script
 * short; there's no shared state between them beyond `video` / `src`.
 */
export function createPlaybackDiagnostics(deps: {
	src: () => string;
	video: () => HTMLVideoElement | null;
	transport: PlayerTransportState;
	audioRisky: () => boolean;
	videoRisky: () => boolean;
	fatalError: () => string | null;
	onLoad: () => void;
	onFatal: (message: string) => void;
	onProgress: (position: number, duration: number) => void;
}) {
	const media = createPlayerMedia({
		src: deps.src,
		video: deps.video,
		onLoad: deps.onLoad,
		onFatal: deps.onFatal,
	});

	const progress = createProgressReporter({
		video: deps.video,
		duration: () => deps.transport.duration,
		currentTime: () => deps.transport.currentTime,
		onProgress: deps.onProgress,
	});

	const silentAudio = createSilentAudioWatch({
		src: deps.src,
		video: deps.video,
		hls: () => media.hls,
		audioRisky: deps.audioRisky,
		blocked: () => Boolean(deps.fatalError()),
		onTrackSwitch: (index) => {
			media.activeAudioTrack = index;
		},
	});

	// Audio plays but the picture never appears — a video codec that dodged the
	// pre-flight probe. Non-fatal + dismissible: a false alarm over a stream
	// that's actually fine must be a shrug, not a wall.
	const videoDecode = createVideoDecodeWatch({
		src: deps.src,
		video: deps.video,
		videoRisky: deps.videoRisky,
		blocked: () => Boolean(deps.fatalError()),
	});

	return { media, progress, silentAudio, videoDecode };
}
