import { describe, expect, it } from "vitest";
import { type AudioByteSample, classifyAudioSamples } from "./silent-audio.js";

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
