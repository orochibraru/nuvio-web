import { describe, expect, it } from "vitest";
import {
	assText,
	assToVtt,
	decodeSubtitle,
	delayLabel,
	isAss,
	isWebVtt,
	srtToVtt,
	toVtt,
	vttTime,
} from "./subtitles.ts";

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

describe("decodeSubtitle", () => {
	const encode = (text: string) => new TextEncoder().encode(text);

	it("reads UTF-8, with or without a BOM", () => {
		expect(decodeSubtitle(encode("Déjà vu"))).toBe("Déjà vu");
		expect(
			decodeSubtitle(new Uint8Array([0xef, 0xbb, 0xbf, ...encode("été")])),
		).toBe("été");
	});

	it("falls back to Windows-1252 for Latin-1 bytes", () => {
		// "Où est la côte ? 'œuvre'" in Windows-1252, curly quotes included.
		const bytes = new Uint8Array([
			0x4f, 0xf9, 0x20, 0x65, 0x73, 0x74, 0x20, 0x6c, 0x61, 0x20, 0x63, 0xf4,
			0x74, 0x65, 0x20, 0x3f, 0x20, 0x92, 0x9c, 0x75, 0x76, 0x72, 0x65, 0x92,
		]);
		expect(decodeSubtitle(bytes)).toBe("Où est la côte ? ’œuvre’");
	});

	it("honours a UTF-16 BOM", () => {
		expect(
			decodeSubtitle(new Uint8Array([0xff, 0xfe, 0xe9, 0x00, 0x61, 0x00])),
		).toBe("éa");
		expect(
			decodeSubtitle(new Uint8Array([0xfe, 0xff, 0x00, 0xe9, 0x00, 0x61])),
		).toBe("éa");
	});
});

const ASS = String.raw`[Script Info]
Title: Test
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,20

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:07.50,Default,,0,0,0,,Second{\i1}, with commas{\i0}, kept
Dialogue: 0,0:00:01.20,0:00:03.00,Default,,0,0,0,,{\an8\pos(10,20)}First line\NSecond\hline
Comment: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,not shown
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\p1}m 0 0 l 100 0 100 100{\p0}
`;

describe("isAss", () => {
	it("spots ASS / SSA section headers", () => {
		expect(isAss(ASS)).toBe(true);
		expect(isAss("1\n00:00:01,000 --> 00:00:02,000\n[Events] in a line")).toBe(
			false,
		);
	});
});

describe("assText", () => {
	it("strips override tags, maps line breaks and hard spaces, escapes markup", () => {
		expect(assText("{\\b1}Bold{\\b0}\\Nnext\\nline")).toBe("Bold\nnext\nline");
		expect(assText("a\\hb <c> & d")).toBe("a b &lt;c&gt; &amp; d");
		expect(assText("{\\p1}m 0 0 l 1 1")).toBe("");
	});
});

describe("assToVtt", () => {
	it("turns Dialogue lines into sorted cues and drops comments and drawings", () => {
		const vtt = assToVtt(ASS);
		expect(vtt).toBe(
			"WEBVTT\n\n00:00:01.200 --> 00:00:03.000\nFirst line\nSecond line\n\n00:00:05.000 --> 00:00:07.500\nSecond, with commas, kept\n",
		);
	});

	it("follows the Format line's field order", () => {
		const ssa = [
			"[Script Info]",
			"[Events]",
			"Format: Marked, Text, Start, End",
			"Dialogue: Marked=0,Hello,0:00:01.00,0:00:02.00",
		].join("\r\n");
		expect(assToVtt(ssa)).toContain("00:00:01.000 --> 00:00:02.000\nHello");
	});
});

describe("toVtt", () => {
	it("routes ASS, SRT and WebVTT", () => {
		expect(toVtt(ASS)).toContain("First line");
		expect(toVtt("1\n00:00:01,000 --> 00:00:02,000\nA")).toContain(
			"00:00:01.000",
		);
		expect(toVtt("WEBVTT\n")).toBe("WEBVTT\n");
	});
});

describe("vttTime", () => {
	it("formats hours, minutes, seconds and milliseconds", () => {
		expect(vttTime(3723.456)).toBe("01:02:03.456");
		expect(vttTime(-1)).toBe("00:00:00.000");
	});
});

describe("delayLabel", () => {
	it("signs a positive delay and keeps one decimal", () => {
		expect(delayLabel(0.5)).toBe("+0.5s");
		expect(delayLabel(-1.2)).toBe("-1.2s");
		expect(delayLabel(0)).toBe("0.0s");
	});
});
