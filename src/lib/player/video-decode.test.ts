import { describe, expect, it } from "vitest";
import { classifyDecodeSamples, decodedFrameCount } from "./video-decode.ts";

describe("classifyDecodeSamples", () => {
	it("is unknown before there are enough ticks", () => {
		expect(classifyDecodeSamples([0, 0, 0], 5)).toBe("unknown");
	});

	it("is ok while frames keep decoding", () => {
		expect(classifyDecodeSamples([30, 30, 30, 30, 30], 5)).toBe("ok");
	});

	it("flags dead only when no frame ever decoded", () => {
		expect(classifyDecodeSamples([0, 0, 0, 0, 0], 5)).toBe("dead");
	});

	it("stays ok if frames decoded even briefly (avoids false positives)", () => {
		expect(classifyDecodeSamples([25, 25, 0, 0, 0, 0, 0], 5)).toBe("ok");
		expect(classifyDecodeSamples([0, 0, 3, 0, 0], 5)).toBe("ok");
	});
});

describe("decodedFrameCount", () => {
	it("prefers getVideoPlaybackQuality().totalVideoFrames", () => {
		const el = {
			getVideoPlaybackQuality: () => ({ totalVideoFrames: 128 }),
			webkitDecodedFrameCount: 5,
		} as unknown as HTMLVideoElement;
		expect(decodedFrameCount(el)).toBe(128);
	});

	it("falls back to the legacy webkitDecodedFrameCount", () => {
		const el = { webkitDecodedFrameCount: 64 } as unknown as HTMLVideoElement;
		expect(decodedFrameCount(el)).toBe(64);
	});

	it("is null when no frame counter is exposed", () => {
		expect(decodedFrameCount({} as HTMLVideoElement)).toBeNull();
	});
});
