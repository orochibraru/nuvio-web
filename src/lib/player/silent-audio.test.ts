import { describe, expect, it } from "vitest";
import {
	type AudioByteSample,
	classifyAudioSamples,
	evaluateAudioTick,
} from "./silent-audio.ts";

/** Build a sample series from per-interval [videoDelta, audioDelta] pairs. */
function series(deltas: Array<[number, number]>): AudioByteSample[] {
	const out: AudioByteSample[] = [{ video: 0, audio: 0 }];
	for (const [v, a] of deltas) {
		const prev = out[out.length - 1];
		out.push({ video: prev.video + v, audio: prev.audio + a });
	}
	return out;
}

describe("classifyAudioSamples", () => {
	it("returns unknown before there is enough data", () => {
		expect(classifyAudioSamples(series([[100, 10]]), 3)).toBe("unknown");
	});

	it("returns ok while audio keeps decoding", () => {
		expect(
			classifyAudioSamples(
				series([
					[100, 10],
					[100, 10],
					[100, 10],
					[100, 10],
				]),
				3,
			),
		).toBe("ok");
	});

	it("flags no-track when audio never produces a byte", () => {
		expect(
			classifyAudioSamples(
				series([
					[100, 0],
					[100, 0],
					[100, 0],
					[100, 0],
				]),
				3,
			),
		).toBe("no-track");
	});

	it("flags codec when audio decodes then stops mid-stream", () => {
		expect(
			classifyAudioSamples(
				series([
					[100, 20],
					[100, 20],
					[100, 0],
					[100, 0],
					[100, 0],
				]),
				3,
			),
		).toBe("codec");
	});

	it("does not flag a short audio-buffer gap", () => {
		expect(
			classifyAudioSamples(
				series([
					[100, 20],
					[100, 0],
					[100, 40],
					[100, 20],
				]),
				3,
			),
		).toBe("ok");
	});

	it("ignores stalled intervals (video not moving either)", () => {
		expect(
			classifyAudioSamples(
				series([
					[100, 20],
					[0, 0],
					[0, 0],
					[0, 0],
					[100, 20],
				]),
				3,
			),
		).toBe("ok");
	});

	it("honours a lower `needed` for label-flagged streams", () => {
		const s = series([
			[100, 0],
			[100, 0],
		]);
		expect(classifyAudioSamples(s, 3)).toBe("unknown"); // needs 4 samples
		expect(classifyAudioSamples(s, 2)).toBe("no-track");
	});
});

describe("evaluateAudioTick", () => {
	const base = {
		mozHasAudio: undefined,
		haveCounters: true,
		samples: [] as AudioByteSample[],
		needed: 4,
		reported: null,
		canSwitchTrack: false,
		audioRisky: false,
		playedSeconds: 1,
	};

	it("flags a definitive Firefox 'no audio track' straight away", () => {
		expect(evaluateAudioTick({ ...base, mozHasAudio: false })).toEqual({
			kind: "flag",
			issue: "no-track",
		});
	});

	it("keeps going while the byte-counter verdict is inconclusive", () => {
		expect(evaluateAudioTick(base)).toEqual({ kind: "continue" });
	});

	// Audio decodes briefly, then goes silent while video keeps going → "codec".
	const codecSeries = series([
		[100, 20],
		[100, 0],
		[100, 0],
		[100, 0],
		[100, 0],
	]);
	// Audio never produces a byte → "no-track".
	const noTrackSeries = series([
		[100, 0],
		[100, 0],
		[100, 0],
		[100, 0],
		[100, 0],
	]);

	it("asks to switch HLS track once on a codec verdict", () => {
		expect(
			evaluateAudioTick({
				...base,
				samples: codecSeries,
				canSwitchTrack: true,
			}),
		).toEqual({ kind: "switch-track" });
	});

	it("does not offer a track switch for a missing track", () => {
		expect(
			evaluateAudioTick({
				...base,
				samples: noTrackSeries,
				canSwitchTrack: true,
			}),
		).toEqual({ kind: "flag", issue: "no-track" });
	});

	it("flags codec once the alternate track has already been tried", () => {
		expect(
			evaluateAudioTick({
				...base,
				samples: codecSeries,
				canSwitchTrack: false,
			}),
		).toEqual({ kind: "flag", issue: "codec" });
	});

	it("falls back to a time threshold when byte counters are unavailable", () => {
		expect(
			evaluateAudioTick({
				...base,
				haveCounters: false,
				audioRisky: true,
				playedSeconds: 6,
			}),
		).toEqual({ kind: "flag", issue: "codec" });
		expect(
			evaluateAudioTick({
				...base,
				haveCounters: false,
				audioRisky: true,
				playedSeconds: 5,
			}),
		).toEqual({ kind: "continue" });
	});
});
