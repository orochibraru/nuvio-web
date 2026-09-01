import type { SubtitleCatalog } from "./subtitle-catalog.svelte.js";
import type { SubtitleSelectionState } from "./subtitle-selection.svelte.js";

/**
 * The two "pick a caption for me" conveniences that sit above plain
 * selection: cycling through tracks (keyboard shortcut) and auto-picking a
 * preferred-language track once per source, the first time playback is
 * ready.
 */
export function createSubtitleShortcuts(deps: {
	catalog: SubtitleCatalog;
	selection: SubtitleSelectionState;
	setCaption: (key: string | null) => void;
	preferredLanguage: () => string;
	languageMatches: (lang: string, preferred: string) => boolean;
}) {
	let autoSubDone = false;

	function cycleCaption() {
		const options = deps.catalog.options;
		if (options.length === 0) {
			return;
		}
		const keys = [null, ...options.map((entry) => entry.key)];
		const index = keys.indexOf(deps.selection.activeCaption);
		deps.setCaption(keys[(index + 1) % keys.length]);
	}

	// Called once playback is ready — auto-picks a preferred-language track,
	// once per source.
	function trySelectPreferred() {
		const preferredLanguage = deps.preferredLanguage();
		if (autoSubDone || !preferredLanguage || deps.selection.activeCaption) {
			return;
		}
		autoSubDone = true;
		const match = deps.catalog.options.find((entry) =>
			deps.languageMatches(entry.lang, preferredLanguage),
		);
		if (match) {
			deps.setCaption(match.key);
		}
	}

	function reset() {
		autoSubDone = false;
	}

	return { cycleCaption, trySelectPreferred, reset };
}
