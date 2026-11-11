/**
 * Pure helpers for the in-browser audio fix (`transmux-session.ts`) : a file
 * whose audio codec the browser can't decode is re-muxed on the fly, video
 * untouched, audio decoded in WASM and re-encoded to stereo.
 */

export interface TimeRange {
	start: number;
	end: number;
}

/** A keyframe-aligned restart can begin a hair after the time asked for. */
const START_TOLERANCE = 0.5;

/**
 * Seconds buffered past `currentTime` in the range holding it, or 0 when the
 * playhead sits outside every range (a seek the pipeline has to restart for).
 */
export function bufferedAhead(
	ranges: readonly TimeRange[],
	currentTime: number,
): number {
	for (const range of ranges) {
		if (
			range.start <= currentTime + START_TOLERANCE &&
			range.end >= currentTime
		) {
			return range.end - currentTime;
		}
	}
	return 0;
}

/** The MSE type string for the re-muxed fragments, from two codec strings. */
export function transmuxMime(videoCodec: string, audioCodec: string): string {
	return `video/mp4; codecs="${videoCodec}, ${audioCodec}"`;
}

/** A track's own name, else its language, else `fallback`. */
export function audioTrackLabel(
	track: { name: string | null; languageCode: string },
	fallback: string,
): string {
	if (track.name) {
		return track.name;
	}
	return track.languageCode && track.languageCode !== "und"
		? track.languageCode
		: fallback;
}
