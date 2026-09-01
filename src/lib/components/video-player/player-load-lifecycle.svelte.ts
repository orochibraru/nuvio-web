import type { PlayerTransportState } from "./player-transport-state.svelte.js";

/**
 * The `<video>` element's load lifecycle: seeking to a saved `startTime` on
 * first metadata, the buffering flag, and the one-silent-reload-then-fatal
 * error recovery. Reads and writes the shared transport state rather than
 * owning any of its own.
 */
export function createPlayerLoadLifecycle(deps: {
	state: PlayerTransportState;
	video: () => HTMLVideoElement | null;
	src: () => string;
	startTime: () => number;
	onFatal: (message: string) => void;
	onEnded?: () => void;
}) {
	let seeded = false;
	// One silent reload is attempted on a recoverable media error before we
	// surface a fatal screen; reset whenever the source changes.
	let recoveryAttempted = false;

	// New source: clear the flags scoped to the previous stream.
	function reset() {
		seeded = false;
		recoveryAttempted = false;
		deps.state.loading = true;
		deps.state.ended = false;
	}

	function onLoadedMetadata() {
		const video = deps.video();
		const startTime = deps.startTime();
		if (!seeded && startTime > 0 && video) {
			video.currentTime = startTime;
			seeded = true;
		}
	}

	function onWaiting() {
		deps.state.loading = true;
	}

	function onMediaError() {
		const video = deps.video();
		// The HLS path reports its own fatals via `Hls.Events.ERROR`.
		if (deps.src().toLowerCase().includes(".m3u8")) {
			return;
		}
		const mediaError = video?.error;
		const code = mediaError?.code;

		// `SRC_NOT_SUPPORTED` (4) means the container/codec can't be played at
		// all — no point retrying.
		if (!mediaError || code === mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
			deps.onFatal(
				"This source can't play in the browser. Its container or codec isn't supported.",
			);
			deps.state.loading = false;
			return;
		}

		// A network / decode error mid-load (debrid + torrent links stall and
		// hiccup): try one silent reload from the last position before giving up.
		if (!recoveryAttempted && video) {
			recoveryAttempted = true;
			const resumeAt = deps.state.currentTime;
			deps.state.loading = true;
			video.load();
			video.currentTime = resumeAt;
			void video.play().catch(() => undefined);
			return;
		}

		deps.onFatal("This source stopped playing and couldn't be recovered.");
		deps.state.loading = false;
	}

	function onEndedInternal() {
		deps.state.ended = true;
		deps.onEnded?.();
	}

	return { reset, onLoadedMetadata, onWaiting, onMediaError, onEndedInternal };
}
