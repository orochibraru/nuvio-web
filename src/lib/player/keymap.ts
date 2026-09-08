export interface PlayerKeyActions {
	togglePlay: () => void;
	seek: (delta: number) => void;
	adjustVolume: (delta: number) => void;
	toggleFullscreen: () => void;
	toggleMute: () => void;
	cycleCaption: () => void;
	toggleInfo: () => void;
	next: () => void;
	episodes: () => void;
	closeMenus: () => void;
}

/**
 * Controls that do their own key handling. The shortcuts below are bound on
 * `window`, so without this they fire no matter what has focus : Space on a
 * focused button in the sources / subtitles / episodes panel would toggle
 * playback *and* `preventDefault()` away the browser's own click-the-button,
 * so the button a keyboard user was activating never fires at all.
 */
const INTERACTIVE =
	'input, textarea, select, button, a[href], [contenteditable="true"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="slider"]';

/**
 * Video-player keyboard shortcuts. Returns `true` when the key was consumed (the
 * caller then nudges the controls back into view). Keys aimed at a focused
 * control are left alone : see `INTERACTIVE`.
 */
export function handlePlayerKey(
	event: KeyboardEvent,
	actions: PlayerKeyActions,
): boolean {
	// Escape is the way out of an open panel, so it has to work from inside one.
	if (event.key === "Escape") {
		actions.closeMenus();
		return true;
	}
	// Duck-typed rather than `instanceof Element`: these tests run in node, where
	// there is no DOM global to compare against.
	const target = event.target as {
		closest?: (selector: string) => unknown;
	} | null;
	if (target?.closest?.(INTERACTIVE)) {
		return false;
	}
	switch (event.key) {
		case " ":
		case "k":
			event.preventDefault();
			actions.togglePlay();
			return true;
		case "ArrowLeft":
		case "j":
			actions.seek(-10);
			return true;
		case "ArrowRight":
		case "l":
			actions.seek(10);
			return true;
		case "ArrowUp":
			actions.adjustVolume(0.1);
			return true;
		case "ArrowDown":
			actions.adjustVolume(-0.1);
			return true;
		case "f":
			actions.toggleFullscreen();
			return true;
		case "m":
			actions.toggleMute();
			return true;
		case "c":
			actions.cycleCaption();
			return true;
		case "i":
			actions.toggleInfo();
			return true;
		case "n":
			actions.next();
			return true;
		case "e":
			actions.episodes();
			return true;
		default:
			return false;
	}
}
