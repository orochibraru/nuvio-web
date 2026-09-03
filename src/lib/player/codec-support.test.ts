import { afterEach, describe, expect, it, vi } from "vitest";
import { browserCanPlayCodec, codecMimeProbe } from "./codec-support.ts";

describe("codecMimeProbe", () => {
	it("maps the codecs we probe", () => {
		expect(codecMimeProbe("HEVC")).toContain("hvc1");
		expect(codecMimeProbe("AV1")).toContain("av01");
		expect(codecMimeProbe("H.264")).toContain("avc1");
	});

	it("returns null for an unrecognised label", () => {
		expect(codecMimeProbe(null)).toBeNull();
		expect(codecMimeProbe("VP9")).toBeNull();
	});
});

describe("browserCanPlayCodec", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is unknown when the label isn't one we probe", () => {
		expect(browserCanPlayCodec(null)).toBe("unknown");
		expect(browserCanPlayCodec("VP9")).toBe("unknown");
	});

	it("is unsupported for Xvid regardless of APIs", () => {
		expect(browserCanPlayCodec("Xvid")).toBe("unsupported");
	});

	it("defers to MediaSource.isTypeSupported when present", () => {
		vi.stubGlobal("MediaSource", {
			isTypeSupported: (type: string) => type.includes("avc1"),
		});
		expect(browserCanPlayCodec("H.264")).toBe("supported");
		expect(browserCanPlayCodec("HEVC")).toBe("unsupported");
	});

	it("is unknown when neither probe API exists", () => {
		vi.stubGlobal("MediaSource", undefined);
		vi.stubGlobal("document", undefined);
		expect(browserCanPlayCodec("HEVC")).toBe("unknown");
	});
});
