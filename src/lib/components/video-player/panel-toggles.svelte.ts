import type { InfoOverlayController } from "./info-overlay-controller.svelte.js";

/**
 * The three mutually-exclusive side panels (info, subtitles, settings) —
 * opening one closes the others, and any one of them open keeps the
 * transport controls up (see `panelOpen`).
 */
export function createPanelToggles(deps: {
	infoOverlay: InfoOverlayController;
}) {
	let settingsOpen = $state(false);
	let subtitlesOpen = $state(false);

	const panelOpen = $derived(
		settingsOpen || subtitlesOpen || deps.infoOverlay.open,
	);

	function toggleInfo() {
		if (deps.infoOverlay.open) {
			deps.infoOverlay.close();
		} else {
			settingsOpen = false;
			subtitlesOpen = false;
			deps.infoOverlay.openSticky();
		}
	}

	function toggleSubtitles() {
		subtitlesOpen = !subtitlesOpen;
		settingsOpen = false;
		deps.infoOverlay.closeSilently();
	}

	function toggleSettings() {
		settingsOpen = !settingsOpen;
		subtitlesOpen = false;
		deps.infoOverlay.closeSilently();
	}

	// Keyboard shortcut: drop both without touching the info overlay.
	function closeMenus() {
		settingsOpen = false;
		subtitlesOpen = false;
	}

	return {
		get settingsOpen() {
			return settingsOpen;
		},
		set settingsOpen(value) {
			settingsOpen = value;
		},
		get subtitlesOpen() {
			return subtitlesOpen;
		},
		set subtitlesOpen(value) {
			subtitlesOpen = value;
		},
		get panelOpen() {
			return panelOpen;
		},
		toggleInfo,
		toggleSubtitles,
		toggleSettings,
		closeMenus,
	};
}
