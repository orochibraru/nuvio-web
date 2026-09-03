import { languageMatches } from "#lib/player/format.js";
import type { SubtitleTrack } from "#lib/player/types.js";
import { createSubtitleCatalog } from "./subtitle-catalog.svelte.ts";
import { createSubtitleSelection } from "./subtitle-selection.svelte.ts";
import { createSubtitleShortcuts } from "./subtitle-shortcuts.svelte.ts";

/**
 * Wires the subtitle catalog, selection, and shortcuts pieces together —
 * see each of those for what they actually own. This is just the glue: the
 * `<video>` element's own `textTracks` is the shared thread running through
 * all three, so the `<track>` elements themselves stay in the caller's
 * template (they must be children of `<video>`).
 */
export function createSubtitleController(deps: {
	tracks: () => SubtitleTrack[];
	video: () => HTMLVideoElement | null;
	preferredLanguage: () => string;
}) {
	const catalog = createSubtitleCatalog({ tracks: deps.tracks });
	const selection = createSubtitleSelection({ catalog, video: deps.video });
	const shortcuts = createSubtitleShortcuts({
		catalog,
		selection: selection.state,
		setCaption: selection.setCaption,
		preferredLanguage: deps.preferredLanguage,
		languageMatches,
	});

	function reset() {
		selection.reset();
		shortcuts.reset();
	}

	return {
		get options() {
			return catalog.options;
		},
		get ready() {
			return catalog.ready;
		},
		get failed() {
			return catalog.failed;
		},
		get activeCaption() {
			return selection.state.activeCaption;
		},
		get pendingCaption() {
			return selection.state.pendingCaption;
		},
		get subtitleOffset() {
			return selection.state.subtitleOffset;
		},
		setCaption: selection.setCaption,
		nudgeSubtitleOffset: selection.nudgeSubtitleOffset,
		cycleCaption: shortcuts.cycleCaption,
		trySelectPreferred: shortcuts.trySelectPreferred,
		reset,
	};
}
