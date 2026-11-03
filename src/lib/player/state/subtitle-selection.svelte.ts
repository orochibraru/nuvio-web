import { tick } from "svelte";
import { toast } from "svelte-sonner";
import { m } from "#lib/i18n/index.js";
import {
	isSubtitleKind,
	type SubtitleCatalog,
} from "./subtitle-catalog.svelte.ts";

export interface SubtitleSelectionState {
	activeCaption: string | null;
	// The track key currently being fetched + converted (drives a row spinner).
	pendingCaption: string | null;
	// Timing nudge (seconds), applied to whichever track is showing.
	subtitleOffset: number;
}

type CueTimings = WeakMap<TextTrackCue, { start: number; end: number }>;

function shiftCues(
	cues: TextTrackCueList,
	offset: number,
	natural: CueTimings,
) {
	for (const cue of Array.from(cues)) {
		const timing = natural.get(cue) ?? {
			start: cue.startTime,
			end: cue.endTime,
		};
		const start = Math.max(0, timing.start + offset);
		if (cue.startTime !== start) {
			natural.set(cue, timing);
			cue.startTime = start;
			cue.endTime = Math.max(0, timing.end + offset);
		}
	}
}

function showOnly(video: HTMLVideoElement, target: TextTrack | null) {
	for (const track of Array.from(video.textTracks)) {
		if (isSubtitleKind(track)) {
			track.mode = track === target ? "showing" : "disabled";
		}
	}
}

/**
 * Which caption is showing, and switching it: resolving the picked track's
 * WebVTT blob (via the catalog) before flipping the `<video>`'s own
 * `textTracks`, and shifting the showing track's cues by the timing nudge.
 */
export function createSubtitleSelection(deps: {
	catalog: SubtitleCatalog;
	video: () => HTMLVideoElement | null;
	initialOffset: () => number;
	onOffset: (offset: number) => void;
}) {
	const state = $state<SubtitleSelectionState>({
		activeCaption: null,
		pendingCaption: null,
		subtitleOffset: deps.initialOffset(),
	});
	const natural: CueTimings = new WeakMap();

	// Cues land late (a `<track>` loading, HLS fragments, the remux path), so this re-runs on every timeupdate.
	function applyOffset() {
		for (const track of Array.from(deps.video()?.textTracks ?? [])) {
			if (track.mode === "showing" && track.cues) {
				shiftCues(track.cues, state.subtitleOffset, natural);
			}
		}
	}

	async function setCaption(key: string | null) {
		// Fetch + convert the picked track before switching to it. A failed
		// fetch (no CORS on the addon host, dead link) leaves the current
		// caption alone.
		if (key && !deps.catalog.ready[key]) {
			state.pendingCaption = key;
			const ok = await deps.catalog.resolve(key);
			state.pendingCaption = null;
			if (!ok) {
				toast.error(m.player_subtitle_load_failed());
				return;
			}
		}
		await tick(); // let the freshly-rendered <track> mount its TextTrack
		const video = deps.video();
		if (!video) {
			return;
		}
		showOnly(video, key ? deps.catalog.textTrack(key) : null);
		state.activeCaption = key;
		applyOffset();
	}

	function nudgeSubtitleOffset(delta: number) {
		state.subtitleOffset = Math.round((state.subtitleOffset + delta) * 10) / 10;
		applyOffset();
		deps.onOffset(state.subtitleOffset);
	}

	// The browser's own menu or hls.js can switch tracks too : follow what shows.
	$effect(() => {
		const video = deps.video();
		if (!video) {
			return;
		}
		const list = video.textTracks;
		const onChange = () => {
			if (state.pendingCaption) {
				return;
			}
			const showing = Array.from(list).find(
				(track) => track.mode === "showing" && isSubtitleKind(track),
			);
			state.activeCaption = showing ? deps.catalog.keyOf(showing) : null;
		};
		list.addEventListener("change", onChange);
		video.addEventListener("timeupdate", applyOffset);
		return () => {
			list.removeEventListener("change", onChange);
			video.removeEventListener("timeupdate", applyOffset);
		};
	});

	return { state, setCaption, nudgeSubtitleOffset };
}
