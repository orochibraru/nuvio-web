import { describe, expect, it } from "vitest";
import { audioTrackLabel, bufferedAhead, transmuxMime } from "./transmux.ts";

describe("bufferedAhead", () => {
	it("measures the range holding the playhead", () => {
		expect(bufferedAhead([{ start: 0, end: 30 }], 10)).toBe(20);
		expect(
			bufferedAhead(
				[
					{ start: 0, end: 5 },
					{ start: 40, end: 70 },
				],
				45,
			),
		).toBe(25);
	});

	it("is 0 when the playhead is outside every range", () => {
		expect(bufferedAhead([], 10)).toBe(0);
		expect(bufferedAhead([{ start: 0, end: 30 }], 31)).toBe(0);
		expect(bufferedAhead([{ start: 150, end: 180 }], 47.7)).toBe(0);
	});

	it("tolerates a range that starts just after the playhead", () => {
		expect(bufferedAhead([{ start: 46.2, end: 80 }], 46)).toBe(34);
		expect(bufferedAhead([{ start: 47, end: 80 }], 46)).toBe(0);
	});
});

describe("transmuxMime", () => {
	it("pairs the video codec string with the audio one", () => {
		expect(transmuxMime("hev1.2.4.L120.B0", "mp4a.40.2")).toBe(
			'video/mp4; codecs="hev1.2.4.L120.B0, mp4a.40.2"',
		);
		expect(transmuxMime("vp09.00.10.08", "opus")).toBe(
			'video/mp4; codecs="vp09.00.10.08, opus"',
		);
	});
});

describe("audioTrackLabel", () => {
	it("prefers the name, then the language, then the fallback", () => {
		expect(
			audioTrackLabel({ name: "VF", languageCode: "fre" }, "Track 1"),
		).toBe("VF");
		expect(
			audioTrackLabel({ name: null, languageCode: "eng" }, "Track 1"),
		).toBe("eng");
		expect(
			audioTrackLabel({ name: null, languageCode: "und" }, "Track 1"),
		).toBe("Track 1");
	});
});
