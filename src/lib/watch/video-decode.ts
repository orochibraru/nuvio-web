/**
 * Runtime detection of a video track that won't decode in this browser — an
 * HEVC / AV1 stream where the pre-flight `MediaSource` probe was inconclusive
 * and `<video>` never fired an `error` (it just shows a black or frozen frame
 * while the audio clock keeps `currentTime` moving).
 *
 * Deliberately conservative — a false "can't play" over a stream that's actually
 * fine is worse than missing a real one — so it only runs for a label-flagged
 * codec, needs a long run of frameless playback, and surfaces a **dismissible
 * banner**, never a fatal takeover.
 */

export type DecodeVerdict = "ok" | "dead" | "unknown";

/**
 * Classify a run of per-tick decoded-frame *deltas*, each taken while playback
 * position was advancing (so a network stall — position frozen — never counts).
 *
 * `dead` only when **no frame ever decoded** across `needed` advancing ticks —
 * the unambiguous "all black, codec unsupported" case. A stream that showed
 * picture and later froze stays `ok` here (rare, and recoverable by seeking).
 */
export function classifyDecodeSamples(
	frameDeltas: readonly number[],
	needed: number,
): DecodeVerdict {
	if (frameDeltas.length < needed) {
		return "unknown";
	}
	if (frameDeltas.some((delta) => delta > 0)) {
		return "ok";
	}
	return "dead";
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
