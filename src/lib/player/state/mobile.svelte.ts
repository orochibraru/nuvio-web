import { MediaQuery } from "svelte/reactivity";

/** `screen.orientation.lock` isn't in the DOM lib yet (Chrome / Android only). */
type LockableOrientation = ScreenOrientation & {
	lock?: (orientation: "landscape") => Promise<void>;
};

/**
 * The player's touch-device behaviour: a phone wants the video to own the
 * screen, sideways, the moment playback starts : not a pause-triggered info
 * sheet, not a tap anywhere pausing it.
 *
 * - `touch` : a coarse pointer, i.e. a phone / tablet.
 * - `enterImmersive` : fullscreen + landscape lock on the first `playing` of
 *   each source. The browser needs a user gesture for fullscreen; the tap that
 *   picked the stream usually still counts, and when it no longer does, the
 *   next tap on the player retries.
 * - `onFullscreenChange` : lock landscape on entering fullscreen (however it
 *   was entered), release it on leaving.
 */
export function createMobilePlayback(deps: {
	fullscreenTarget: () => Element | null;
	minimized: () => boolean;
}) {
	const coarse = new MediaQuery("(pointer: coarse)", false);
	let attempted = false;
	let retryOnTap = false;

	function orientation(): LockableOrientation | null {
		return typeof screen === "undefined" ? null : screen.orientation;
	}

	function unlock() {
		try {
			orientation()?.unlock?.();
		} catch {
			// Nothing was locked.
		}
	}

	async function requestFullscreen() {
		const target = deps.fullscreenTarget();
		if (!target || document.fullscreenElement) {
			return true;
		}
		try {
			await target.requestFullscreen({ navigationUI: "hide" });
			return true;
		} catch {
			return false;
		}
	}

	async function enterImmersive() {
		if (!coarse.current || attempted || deps.minimized()) {
			return;
		}
		attempted = true;
		retryOnTap = !(await requestFullscreen());
	}

	/** A tap on the player : the user gesture a refused auto-fullscreen needs. */
	function onTap() {
		if (!retryOnTap) {
			return;
		}
		retryOnTap = false;
		void requestFullscreen();
	}

	function onFullscreenChange() {
		const screenOrientation = orientation();
		if (!(coarse.current && screenOrientation)) {
			return;
		}
		if (document.fullscreenElement) {
			// Refused on desktop-class browsers and iOS : fullscreen still stands.
			screenOrientation.lock?.("landscape").catch(() => undefined);
		} else {
			unlock();
		}
	}

	function reset() {
		attempted = false;
		retryOnTap = false;
	}

	// Leaving the player (Back, navigation) mustn't strand the app fullscreen
	// and sideways.
	$effect(() => () => {
		if (!coarse.current) {
			return;
		}
		unlock();
		if (document.fullscreenElement) {
			void document.exitFullscreen().catch(() => undefined);
		}
	});

	return {
		get touch() {
			return coarse.current;
		},
		enterImmersive,
		onTap,
		onFullscreenChange,
		reset,
	};
}
