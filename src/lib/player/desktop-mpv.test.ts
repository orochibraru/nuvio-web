import { describe, expect, it } from "vitest";
import { mpvSubtitles } from "./desktop-mpv.ts";

describe("mpvSubtitles", () => {
	const options = [
		{ lang: "eng", url: "https://subs.example/en.srt" },
		{ lang: "fre", url: "https://subs.example/fr.srt" },
		{ lang: "fr-FR", url: "https://subs.example/fr-2.srt" },
		{ lang: "fr", url: "/api/downloads/local/x/Film.fr.srt" },
	];

	it("puts the preferred language first and keeps only http(s) URLs", () => {
		expect(mpvSubtitles(options, "fr")).toEqual([
			"https://subs.example/fr.srt",
			"https://subs.example/fr-2.srt",
			"https://subs.example/en.srt",
		]);
	});

	it("keeps the addon order without a preference", () => {
		expect(mpvSubtitles(options, "")).toEqual([
			"https://subs.example/en.srt",
			"https://subs.example/fr.srt",
			"https://subs.example/fr-2.srt",
		]);
	});
});
