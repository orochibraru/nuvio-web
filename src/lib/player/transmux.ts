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

const C = Math.SQRT1_2;

// [left, right] per channel, in FFmpeg's order (L R C LFE …). mediabunny's own
// remix keeps only L and R of a 3, 5, 7 or 8 channel track : no center, no dialogue.
const STEREO_GAINS: Record<number, [number, number][]> = {
	1: [[1, 1]],
	3: [
		[1, 0],
		[0, 1],
		[C, C],
	],
	4: [
		[1, 0],
		[0, 1],
		[C, C],
		[C, C],
	],
	5: [
		[1, 0],
		[0, 1],
		[C, C],
		[C, 0],
		[0, C],
	],
	6: [
		[1, 0],
		[0, 1],
		[C, C],
		[0, 0],
		[C, 0],
		[0, C],
	],
	7: [
		[1, 0],
		[0, 1],
		[C, C],
		[0, 0],
		[0.5, 0.5],
		[C, 0],
		[0, C],
	],
	8: [
		[1, 0],
		[0, 1],
		[C, C],
		[0, 0],
		[C, 0],
		[0, C],
		[C, 0],
		[0, C],
	],
};

/** Planar stereo (every left frame, then every right one) from planar channels. */
export function downmixToStereo(planes: readonly Float32Array[]): Float32Array {
	const frames = planes[0]?.length ?? 0;
	const out = new Float32Array(frames * 2);
	if (planes.length === 2) {
		out.set(planes[0]);
		out.set(planes[1], frames);
		return out;
	}
	const gains = STEREO_GAINS[planes.length] ?? STEREO_GAINS[3];
	planes.forEach((plane, channel) => {
		const [left, right] = gains[channel] ?? [0, 0];
		for (let frame = 0; frame < frames; frame++) {
			out[frame] += left * plane[frame];
			out[frames + frame] += right * plane[frame];
		}
	});
	return out;
}
