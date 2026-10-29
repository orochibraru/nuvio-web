import type { InfoOverlayController } from "./info-overlay.svelte.ts";

/** The control row's menus : one open at a time. */
export type PlayerMenu = "speed" | "boost" | "audio";

/**
 * The mutually-exclusive panels (info, the subtitles menu, one control-row menu) :
 * opening one closes the others, and any one of them open keeps the transport
 * controls up (see `panelOpen`).
 */
export function createPanelToggles(deps: {
	infoOverlay: InfoOverlayController;
}) {
	let openMenu = $state<PlayerMenu | null>(null);
	let subtitlesOpen = $state(false);

	const panelOpen = $derived(
		openMenu !== null || subtitlesOpen || deps.infoOverlay.open,
	);

	function toggleInfo() {
		if (deps.infoOverlay.open) {
			deps.infoOverlay.close();
		} else {
			openMenu = null;
			subtitlesOpen = false;
			deps.infoOverlay.openSticky();
		}
	}

	/** The subtitles menu's `onOpenChange` : opening it closes the others. */
	function setSubtitlesOpen(open: boolean) {
		subtitlesOpen = open;
		if (open) {
			openMenu = null;
			deps.infoOverlay.closeSilently();
		}
	}

	/** A menu's `onOpenChange` : opening it closes the other panels. */
	function setMenuOpen(menu: PlayerMenu, open: boolean) {
		if (open) {
			openMenu = menu;
			subtitlesOpen = false;
			deps.infoOverlay.closeSilently();
		} else if (openMenu === menu) {
			openMenu = null;
		}
	}

	// Keyboard shortcut: drop both without touching the info overlay.
	function closeMenus() {
		openMenu = null;
		subtitlesOpen = false;
	}

	return {
		get openMenu() {
			return openMenu;
		},
		get subtitlesOpen() {
			return subtitlesOpen;
		},
		get panelOpen() {
			return panelOpen;
		},
		toggleInfo,
		setSubtitlesOpen,
		setMenuOpen,
		closeMenus,
	};
}
