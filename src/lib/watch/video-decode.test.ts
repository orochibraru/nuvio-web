import { describe, expect, it } from "vitest";
import { classifyDecodeSamples, decodedFrameCount } from "./video-decode.ts";

describe("classifyDecodeSamples", () => {
	it("is unknown before there are enough ticks", () => {
		expect(classifyDecodeSamples([0, 0, 0], 5)).toBe("unknown");
	});

	it("is ok while frames keep decoding", () => {
		expect(classifyDecodeSamples([30, 30, 30, 30, 30], 5)).toBe("ok");
	});

	it("flags dead after `needed` consecutive zero-frame ticks", () => {
		expect(classifyDecodeSamples([0, 0, 0, 0, 0], 5)).toBe("dead");
	});

	it("flags dead when frames decode briefly then stop for good", () => {
		expect(classifyDecodeSamples([25, 25, 0, 0, 0, 0, 0], 5)).toBe("dead");
	});

	it("does not flag a single dropped-frame tick mid-stream", () => {
		expect(classifyDecodeSamples([30, 30, 0, 30, 30, 30], 5)).toBe("ok");
	});

	it("honours a shorter fuse for label-flagged codecs", () => {
		expect(classifyDecodeSamples([0, 0, 0], 5)).toBe("unknown");
		expect(classifyDecodeSamples([0, 0, 0], 3)).toBe("dead");
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
