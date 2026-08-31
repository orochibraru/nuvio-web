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
 * Video-player keyboard shortcuts. Returns `true` when the key was consumed (the
 * caller then nudges the controls back into view). Keys typed into an `<input>`
 * are ignored.
 */
export function handlePlayerKey(
	event: KeyboardEvent,
	actions: PlayerKeyActions,
): boolean {
	if ((event.target as { tagName?: string } | null)?.tagName === "INPUT") {
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
		case "Escape":
			actions.closeMenus();
			return true;
		default:
			return false;
	}
}
