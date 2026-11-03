export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** The listed speed one step up or down from `rate`, held at either end. */
export function stepRate(rate: number, step: 1 | -1): number {
	const index =
		step > 0
			? PLAYBACK_RATES.findIndex((candidate) => candidate > rate)
			: PLAYBACK_RATES.findLastIndex((candidate) => candidate < rate);
	return index === -1 ? rate : PLAYBACK_RATES[index];
}
