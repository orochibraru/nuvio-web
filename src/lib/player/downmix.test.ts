import { describe, expect, it } from "vitest";
import { downmixInto, downmixToStereo } from "./downmix.ts";

describe("downmixToStereo", () => {
	const only = (channels: number, lit: number) =>
		Array.from(
			{ length: channels },
			(_, channel) => new Float32Array([channel === lit ? 1 : 0]),
		);

	it("keeps the center of a 7.1 track in both ears", () => {
		const [left, right] = downmixToStereo(only(8, 2));
		expect(left).toBeCloseTo(Math.SQRT1_2);
		expect(right).toBeCloseTo(Math.SQRT1_2);
	});

	it("keeps the center of 3.0, 5.0 and 6.1 tracks", () => {
		for (const channels of [3, 5, 7]) {
			const [left, right] = downmixToStereo(only(channels, 2));
			expect(left).toBeCloseTo(Math.SQRT1_2);
			expect(right).toBeCloseTo(Math.SQRT1_2);
		}
	});

	it("sends each surround to its own side and drops LFE", () => {
		expect([...downmixToStereo(only(6, 4))]).toEqual([
			expect.closeTo(Math.SQRT1_2),
			0,
		]);
		expect([...downmixToStereo(only(8, 7))]).toEqual([
			0,
			expect.closeTo(Math.SQRT1_2),
		]);
		expect([...downmixToStereo(only(6, 3))]).toEqual([0, 0]);
	});

	it("plays mono in both ears and passes stereo through", () => {
		expect([...downmixToStereo([new Float32Array([0.5])])]).toEqual([0.5, 0.5]);
		expect([
			...downmixToStereo([
				new Float32Array([0.1, 0.2]),
				new Float32Array([0.3, 0.4]),
			]),
		]).toEqual([
			expect.closeTo(0.1),
			expect.closeTo(0.2),
			expect.closeTo(0.3),
			expect.closeTo(0.4),
		]);
	});
});

describe("downmixInto", () => {
	it("overwrites what the buffers held, as the worklet reuses them", () => {
		const left = new Float32Array([9, 9]);
		const right = new Float32Array([9, 9]);
		const planes = Array.from({ length: 8 }, (_, channel) =>
			new Float32Array(2).fill(channel === 0 ? 0.5 : 0),
		);
		downmixInto(planes, left, right);
		expect([...left]).toEqual([0.5, 0.5]);
		expect([...right]).toEqual([0, 0]);
	});
});
