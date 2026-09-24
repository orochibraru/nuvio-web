/** Volume boost levels offered in the settings menu : 1 is off. */
export const BOOST_LEVELS = [1, 1.5, 2, 3] as const;

/**
 * Whether `<video>` must be reloaded with `crossorigin="anonymous"` before Web
 * Audio can hear it. A cross-origin resource loaded without CORS "taints" the
 * element, and a `MediaElementAudioSourceNode` then outputs silence. MSE
 * (`blob:`, i.e. hls.js), offline copies and same-origin files never taint.
 */
export function needsCorsReload(
	currentSrc: string,
	crossOrigin: string | null,
	origin: string,
): boolean {
	if (crossOrigin !== null || !currentSrc) {
		return false;
	}
	try {
		const url = new URL(currentSrc, origin);
		return (
			url.protocol !== "blob:" &&
			url.protocol !== "data:" &&
			url.origin !== origin
		);
	} catch {
		return false;
	}
}
