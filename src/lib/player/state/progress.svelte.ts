import { onDestroy } from "svelte";

interface ProgressDeps {
	video: () => HTMLVideoElement | null;
	duration: () => number;
	/** Reactive `currentTime` (the `bind:currentTime` value), for the heartbeat. */
	currentTime: () => number;
	onProgress?: (position: number, duration: number) => void;
}

/**
 * Persist watch position: a 15s heartbeat while playing, plus a flush on pause,
 * tab-hide, `pagehide` and unmount (closing the tab mid-episode otherwise loses
 * up to 15s and the unmount save never runs).
 */
export function createProgressReporter(deps: ProgressDeps) {
	// Furthest position reported for the current source : guards against a
	// transient `currentTime` reset (e.g. right after a recovery `video.load()`)
	// pushing `position: 0` over real progress. Cleared via `reset()`.
	let furthest = 0;

	function flush() {
		const video = deps.video();
		const duration = deps.duration();
		if (!(video && duration > 0 && Number.isFinite(video.currentTime))) {
			return;
		}
		const position = video.currentTime;
		if (position < 5 && furthest > 30) {
			return;
		}
		furthest = Math.max(furthest, position);
		deps.onProgress?.(position, duration);
	}

	$effect(() => {
		const timer = setInterval(() => {
			const video = deps.video();
			const duration = deps.duration();
			if (video && !video.paused && duration > 0) {
				deps.onProgress?.(deps.currentTime(), duration);
			}
		}, 15_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (typeof document === "undefined") {
			return;
		}
		const onHide = () => {
			if (document.visibilityState === "hidden") {
				flush();
			}
		};
		document.addEventListener("visibilitychange", onHide);
		window.addEventListener("pagehide", flush);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			window.removeEventListener("pagehide", flush);
		};
	});

	onDestroy(flush);

	return {
		flush,
		reset() {
			furthest = 0;
		},
	};
}
