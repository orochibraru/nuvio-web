import type { PlayerTransportState } from "./transport-state.svelte.ts";

/**
 * The transport actions the keyboard shortcuts and the transport controls
 * drive : play/pause, seek, volume, fullscreen, PiP, and the "hide the
 * controls after 3s idle" timer. Reads and writes the shared transport
 * state rather than owning any of its own.
 */
export function createPlayerTransportActions(deps: {
	state: PlayerTransportState;
	container: () => HTMLDivElement | null;
	video: () => HTMLVideoElement | null;
	panelOpen: () => boolean;
}) {
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function togglePlay() {
		const video = deps.video();
		if (!video) {
			return;
		}
		if (video.ended) {
			video.currentTime = 0;
			void video.play();
		} else if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	}

	function seek(delta: number) {
		const video = deps.video();
		if (!video) {
			return;
		}
		const upper = Number.isFinite(video.duration)
			? video.duration
			: Number.POSITIVE_INFINITY;
		video.currentTime = Math.min(Math.max(0, video.currentTime + delta), upper);
	}

	function onScrub(value: number) {
		const video = deps.video();
		if (video) {
			video.currentTime = value;
		}
	}

	function adjustVolume(delta: number) {
		deps.state.volume = Math.min(
			1,
			Math.max(0, Number((deps.state.volume + delta).toFixed(2))),
		);
		deps.state.muted = deps.state.volume === 0;
	}

	async function toggleFullscreen() {
		const container = deps.container();
		if (!container) {
			return;
		}
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await container.requestFullscreen();
		}
	}

	async function togglePip() {
		const video = deps.video();
		if (!video) {
			return;
		}
		if (document.pictureInPictureElement) {
			await document.exitPictureInPicture();
		} else if (document.pictureInPictureEnabled) {
			await video.requestPictureInPicture();
		}
	}

	function nudgeControls() {
		deps.state.controlsVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (!(deps.state.paused || deps.panelOpen())) {
				deps.state.controlsVisible = false;
			}
		}, 3000);
	}

	return {
		togglePlay,
		seek,
		onScrub,
		adjustVolume,
		toggleFullscreen,
		togglePip,
		nudgeControls,
	};
}
