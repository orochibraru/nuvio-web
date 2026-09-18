import { describe, expect, it } from "vitest";
import { chooseSubtitles, playbackSubtitles } from "./subtitles.ts";
import type { DownloadRecord } from "./types.ts";

const options = [
	{ lang: "fre", url: "f1" },
	{ lang: "eng", url: "e1" },
	{ lang: "fre", url: "f2" },
	{ lang: "en", url: "e2" },
	{ lang: "spa", url: "s1" },
	{ lang: "ger", url: "g1" },
];

describe("chooseSubtitles", () => {
	it("puts the preferred language first, one per language", () => {
		expect(chooseSubtitles(options, "en").map((o) => o.url)).toEqual([
			"e1",
			"e2",
			"f1",
			"s1",
			"g1",
		]);
	});

	it("caps the count", () => {
		expect(chooseSubtitles(options, "", 2).map((o) => o.url)).toEqual([
			"f1",
			"e1",
		]);
	});
});

describe("playbackSubtitles", () => {
	it("points each kept subtitle at its local file", () => {
		const record = {
			id: "0b6c1f4e-8d2a-4c3b-9e7f-1a2b3c4d5e6f",
			subtitles: [{ lang: "en", sdh: true, file: "1.srt" }],
		} as DownloadRecord;
		expect(playbackSubtitles(record)).toEqual([
			{
				id: "download:0",
				lang: "en",
				url: "/offline-media/0b6c1f4e-8d2a-4c3b-9e7f-1a2b3c4d5e6f/subs/1.srt",
				addonName: "Downloaded",
				sdh: true,
			},
		]);
	});
});
