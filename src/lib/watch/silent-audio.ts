/**
 * Runtime detection of a media source that plays video but produces no sound —
 * an audio codec the browser can't decode (Dolby Digital / DTS / Atmos …) or a
 * file with no audio track at all. The decision logic is pure so it can be
 * unit-tested; the collection of samples lives in the player component.
 */

export interface AudioByteSample {
	/** Cumulative bytes the video decoder has output (`webkitVideoDecodedByteCount`). */
	video: number;
	/** Cumulative bytes the audio decoder has output (`webkitAudioDecodedByteCount`). */
	audio: number;
}

export type AudioVerdict = "ok" | "no-track" | "codec" | "unknown";

/**
 * Classify a rolling window of `webkit{Video,Audio}DecodedByteCount` readings
 * (one per ~1s of active playback).
 *
 * - `codec`  — audio decoded some bytes then stopped while video kept going.
 * - `no-track` — video decoded but audio never produced a single byte.
 * - `ok` — audio is decoding.
 * - `unknown` — not enough data yet.
 *
 * `needed` consecutive silent intervals are required before a negative verdict,
 * so brief audio-buffer gaps don't trip it.
 */
export function classifyAudioSamples(
	samples: readonly AudioByteSample[],
	needed: number,
): AudioVerdict {
	if (samples.length < needed + 1) {
		return "unknown";
	}

	const first = samples[0];
	let everAudio = false;
	let silentRun = 0;
	let flagged = false;

	for (let i = 1; i < samples.length; i += 1) {
		const videoDelta = samples[i].video - samples[i - 1].video;
		const audioDelta = samples[i].audio - samples[i - 1].audio;

		if (audioDelta > 0) {
			everAudio = true;
			silentRun = 0;
		} else if (videoDelta > 0) {
			silentRun += 1;
			if (silentRun >= needed) {
				flagged = true;
			}
		}
		// A stalled interval (video also not moving) neither confirms nor denies.
	}

	if (flagged) {
		// If audio produced bytes at any point in the window it's a decodable
		// track that later failed → codec; otherwise there was never a track.
		return everAudio || samples.some((s) => s.audio > first.audio)
			? "codec"
			: "no-track";
	}
	return everAudio ? "ok" : "unknown";
}

/**
 * A definitive "no audio track" from a per-browser API, or `null` when the
 * browser doesn't expose one (fall back to the byte-counter heuristic).
 */
export function reportedAudioTrack(video: HTMLVideoElement): boolean | null {
	const v = video as HTMLVideoElement & {
		mozHasAudio?: boolean;
		audioTracks?: { length: number };
	};
	if (typeof v.mozHasAudio === "boolean") {
		return v.mozHasAudio;
	}
	// A populated list is trustworthy; an empty one may just be "not enumerated"
	// (common for cross-origin media), so don't treat 0 as definitive.
	if (v.audioTracks && v.audioTracks.length > 0) {
		return true;
	}
	return null;
}
