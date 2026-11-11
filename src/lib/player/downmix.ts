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

/** Mixes planar channels down into `left` and `right`, overwriting them. */
export function downmixInto(
	planes: readonly Float32Array[],
	left: Float32Array,
	right: Float32Array,
): void {
	if (planes.length === 2) {
		left.set(planes[0]);
		right.set(planes[1]);
		return;
	}
	left.fill(0);
	right.fill(0);
	const gains = STEREO_GAINS[planes.length] ?? STEREO_GAINS[3];
	planes.forEach((plane, channel) => {
		const [toLeft, toRight] = gains[channel] ?? [0, 0];
		for (let frame = 0; frame < plane.length; frame++) {
			left[frame] += toLeft * plane[frame];
			right[frame] += toRight * plane[frame];
		}
	});
}

/** Planar stereo (every left frame, then every right one) from planar channels. */
export function downmixToStereo(planes: readonly Float32Array[]): Float32Array {
	const frames = planes[0]?.length ?? 0;
	const out = new Float32Array(frames * 2);
	downmixInto(planes, out.subarray(0, frames), out.subarray(frames));
	return out;
}
