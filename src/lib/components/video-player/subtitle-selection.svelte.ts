import { tick } from "svelte";
import { toast } from "svelte-sonner";
import type { SubtitleCatalog } from "./subtitle-catalog.svelte.js";

export interface SubtitleSelectionState {
	activeCaption: string | null;
	// The track key currently being fetched + converted (drives a row spinner).
	pendingCaption: string | null;
	// Timing nudge (seconds), applied as a delta to the showing track's cues.
	// Resets when the track changes.
	subtitleOffset: number;
}

/**
 * Which caption is showing, and switching it: resolving the picked track's
 * WebVTT blob (via the catalog) before flipping the `<video>`'s own
 * `textTracks`, and nudging cue timing on the currently-showing track.
 */
export function createSubtitleSelection(deps: {
	catalog: SubtitleCatalog;
	video: () => HTMLVideoElement | null;
}) {
	const state = $state<SubtitleSelectionState>({
		activeCaption: null,
		pendingCaption: null,
		subtitleOffset: 0,
	});

	async function setCaption(key: string | null) {
		// Fetch + convert the picked track before switching to it. A failed
		// fetch (no CORS on the addon host, dead link) leaves the current
		// caption alone.
		if (key && !deps.catalog.ready[key]) {
			state.pendingCaption = key;
			const ok = await deps.catalog.resolve(key);
			state.pendingCaption = null;
			if (!ok) {
				toast.error(
					"That subtitle file couldn't be loaded. Try another track.",
				);
				return;
			}
		}
		await tick(); // let the freshly-rendered <track> mount its TextTrack
		const video = deps.video();
		if (!video) {
			return;
		}
		for (const track of Array.from(video.textTracks)) {
			track.mode = track.label === key ? "showing" : "disabled";
		}
		state.activeCaption = key;
		// A fresh track starts at its natural timing.
		state.subtitleOffset = 0;
	}

	function nudgeSubtitleOffset(delta: number) {
		const video = deps.video();
		if (!video) {
			return;
		}
		state.subtitleOffset = Math.round((state.subtitleOffset + delta) * 10) / 10;
		for (const track of Array.from(video.textTracks)) {
			if (track.mode !== "showing" || !track.cues) {
				continue;
			}
			for (const cue of Array.from(track.cues)) {
				cue.startTime = Math.max(0, cue.startTime + delta);
				cue.endTime = Math.max(0, cue.endTime + delta);
			}
		}
	}

	// New source, same component instance (e.g. an in-place HLS reload) : the
	// active caption survives; only any timing nudge from the old track resets.
	function reset() {
		state.subtitleOffset = 0;
	}

	return { state, setCaption, nudgeSubtitleOffset, reset };
}
