/**
 * Runtime detection of a video track that won't decode in this browser — an
 * HEVC / AV1 / VP9-profile-2 stream where the pre-flight `MediaSource`
 * probe (`codec-support.ts`) came back "unknown" and `<video>` never fired an
 * `error` (it just shows a black or frozen frame while the audio clock keeps
 * `currentTime` moving). Mirrors the silent-audio watch, but this is fatal:
 * there's no watching a video with no picture.
 *
 * The decision is pure so it can be unit-tested; the rune in
 * `video-decode.svelte.ts` owns the timer and the frame-counter reads.
 */

export type DecodeVerdict = "ok" | "dead" | "unknown";

/**
 * Classify a run of per-tick decoded-frame *deltas*, each taken while playback
 * position was advancing (so a network stall — position frozen — never counts).
 *
 * - `dead` — `needed` consecutive advancing ticks decoded zero new frames.
 * - `ok` — frames are being decoded.
 * - `unknown` — not enough ticks yet, or nothing conclusive.
 */
export function classifyDecodeSamples(
	frameDeltas: readonly number[],
	needed: number,
): DecodeVerdict {
	if (frameDeltas.length < needed) {
		return "unknown";
	}
	let everFrames = false;
	let zeroRun = 0;
	for (const delta of frameDeltas) {
		if (delta > 0) {
			everFrames = true;
			zeroRun = 0;
		} else {
			zeroRun += 1;
		}
	}
	if (zeroRun >= needed) {
		return "dead";
	}
	return everFrames ? "ok" : "unknown";
}

/**
 * Cumulative decoded video frames, or `null` when the browser exposes no
 * frame counter (fall back to the `<video>` `error` event only).
 */
export function decodedFrameCount(video: HTMLVideoElement): number | null {
	const el = video as HTMLVideoElement & {
		getVideoPlaybackQuality?: () => { totalVideoFrames: number };
		webkitDecodedFrameCount?: number;
	};
	if (typeof el.getVideoPlaybackQuality === "function") {
		return el.getVideoPlaybackQuality().totalVideoFrames;
	}
	if (typeof el.webkitDecodedFrameCount === "number") {
		return el.webkitDecodedFrameCount;
	}
	return null;
}
