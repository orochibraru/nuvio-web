import type { SelectedStream } from "./playback.svelte.ts";

interface Target {
	type: string;
	videoId: string;
	/** What the player is playing, to mark it; from /detail, the drawer marks the last played instead. */
	playing: SelectedStream | null;
}

/**
 * The source-picker drawer, shared by `/detail` and `/player` through the
 * `(watch)` layout. Kept in module state (not the URL) so opening or closing it
 * never touches history : the back button leaves the page, it doesn't just
 * dismiss the drawer.
 */
class SourcesPanel {
	#target = $state<Target | null>(null);

	get target(): Target | null {
		return this.#target;
	}

	open(type: string, videoId: string, playing: SelectedStream | null = null) {
		this.#target = { type, videoId, playing };
	}

	close() {
		this.#target = null;
	}
}

export const sourcesPanel = new SourcesPanel();
