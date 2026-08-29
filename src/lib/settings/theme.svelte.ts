import { setMode } from "mode-watcher";
import { DEFAULT_UI_SETTINGS, type UiSettings } from "./ui-settings.ts";

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
	}

	/** Apply a change locally for an instant response; persisting it is the caller's job. */
	preview(settings: UiSettings) {
		this.settings = settings;
		setMode(settings.mode);
	}
}

export const theme = new ThemeController();
