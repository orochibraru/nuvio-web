import { setMode } from "mode-watcher";
import { browser } from "$app/env";
import { DEFAULT_UI_SETTINGS, type UiSettings } from "./ui-settings.ts";

/**
 * Cached accent + dark-style, mirrored to `localStorage` so the inline script in
 * `app.html` can paint the right `[data-accent]` / `[data-amoled]` before the
 * server settings arrive (no accent / AMOLED flash). Kept in sync on every
 * `seed` / `preview`; the server value still wins on reconcile.
 */
const CACHE_KEY = "nuvio:theme";

function cache(settings: UiSettings) {
	if (!browser) {
		return;
	}
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({
				accent: settings.accent,
				darkStyle: settings.darkStyle,
			}),
		);
	} catch {
		// storage unavailable — the effect in the app layout still applies it
	}
}

function applyDataset(settings: UiSettings) {
	if (!browser) {
		return;
	}
	const root = document.documentElement;
	root.dataset.accent = settings.accent;
	root.dataset.amoled = String(settings.darkStyle === "amoled");
}

class ThemeController {
	private settings = $state<UiSettings | null>(null);

	get current(): UiSettings {
		return this.settings ?? DEFAULT_UI_SETTINGS;
	}

	/** False during SSR / before the client seeds from server data. */
	get ready(): boolean {
		return this.settings !== null;
	}

	/** Apply the server's stored settings once, on the client. */
	seed(settings: UiSettings) {
		if (this.settings) {
			return;
		}
		this.settings = settings;
		setMode(settings.mode);
		cache(settings);
		applyDataset(settings);
	}

	/** Apply a change locally for an instant response; persisting it is the caller's job. */
	preview(settings: UiSettings) {
		this.settings = settings;
		setMode(settings.mode);
		cache(settings);
		applyDataset(settings);
	}
}

export const theme = new ThemeController();
