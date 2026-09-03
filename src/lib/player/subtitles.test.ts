import { describe, expect, it } from "vitest";
import { isWebVtt, srtToVtt } from "./subtitles.ts";

describe("isWebVtt", () => {
	it("recognises a WebVTT header, BOM or not", () => {
		expect(isWebVtt("WEBVTT\n\n...")).toBe(true);
		expect(isWebVtt("﻿WEBVTT\n")).toBe(true);
		expect(isWebVtt("  \nWEBVTT")).toBe(true);
		expect(isWebVtt("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});

describe("srtToVtt", () => {
	it("adds the header and converts comma millisecond separators", () => {
		const srt = "1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n";
		const vtt = srtToVtt(srt);
		expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
		expect(vtt).toContain("00:00:01.000 --> 00:00:02.500");
		expect(vtt).not.toContain("\r");
	});

	it("passes an existing WebVTT file through, stripping only the BOM", () => {
		const vtt = "﻿WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi";
		expect(srtToVtt(vtt)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi");
	});

	it("leaves cue numbers and blank lines intact", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,000 --> 00:00:04,000\nB";
		const vtt = srtToVtt(srt);
		expect(vtt).toContain("\n1\n");
		expect(vtt).toContain("\n\n2\n");
	});
});
