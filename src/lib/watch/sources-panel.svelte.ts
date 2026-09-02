/**
 * The source-picker drawer, shared by `/detail` and `/player` through the
 * `(watch)` layout. Kept in module state (not the URL) so opening or closing it
 * never touches history : the back button leaves the page, it doesn't just
 * dismiss the drawer.
 */
class SourcesPanel {
	#target = $state<{ type: string; videoId: string } | null>(null);

	get target(): { type: string; videoId: string } | null {
		return this.#target;
	}

	open(type: string, videoId: string) {
		this.#target = { type, videoId };
	}

	close() {
		this.#target = null;
	}
}

export const sourcesPanel = new SourcesPanel();
