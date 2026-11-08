import { describe, expect, it } from "vitest";
import {
	downloadName,
	safeFileName,
	subtitleName,
	uniqueName,
	videoExtension,
} from "./disk-names.ts";

const bytes = (...values: Array<number | string>) =>
	new Uint8Array(
		values.flatMap((value) =>
			typeof value === "string"
				? [...value].map((character) => character.charCodeAt(0))
				: [value],
		),
	);

describe("downloadName", () => {
	it("names a movie after its title, an episode after its show and number", () => {
		expect(
			downloadName({ title: "Need for Speed", season: null, episode: null }),
		).toBe("Need for Speed");
		expect(downloadName({ title: "Breaking Bad", season: 1, episode: 2 })).toBe(
			"Breaking Bad S01E02",
		);
	});
});

describe("safeFileName", () => {
	it("drops what a file system refuses", () => {
		expect(safeFileName('Mission: Impossible / "Fallout"?')).toBe(
			"Mission Impossible Fallout",
		);
		expect(safeFileName(" ..hidden. ")).toBe("hidden");
		expect(safeFileName("???")).toBe("Download");
		expect(safeFileName("CON")).toBe("CON (video)");
		expect(safeFileName("x".repeat(300))).toHaveLength(100);
	});
});

describe("uniqueName", () => {
	it("numbers a name already taken", () => {
		const taken = new Set(["Heat", "Heat (2)"]);
		expect(uniqueName("Heat", (name) => taken.has(name))).toBe("Heat (3)");
		expect(uniqueName("Ronin", (name) => taken.has(name))).toBe("Ronin");
	});
});

describe("videoExtension", () => {
	it("reads the container from the file's first bytes", () => {
		expect(videoExtension(bytes(0, 0, 0, 0x18, "ftypisom"), "")).toBe("mp4");
		expect(videoExtension(bytes(0, 0, 0, 0x14, "ftypqt  "), "")).toBe("mov");
		expect(
			videoExtension(bytes(0x1a, 0x45, 0xdf, 0xa3, "\u0084matroska"), ""),
		).toBe("mkv");
		expect(
			videoExtension(bytes(0x1a, 0x45, 0xdf, 0xa3, "\u0084webm"), ""),
		).toBe("webm");
		expect(videoExtension(bytes("RIFF", 0, 0, 0, 0, "AVI "), "")).toBe("avi");
	});

	it("falls back to the URL's extension, then to mkv", () => {
		const unknown = bytes(1, 2, 3, 4);
		expect(videoExtension(unknown, "https://cdn.example/Film.2014.mp4")).toBe(
			"mp4",
		);
		expect(
			videoExtension(unknown, "https://debrid.example/api/debrid/abc/0"),
		).toBe("mkv");
	});
});

describe("subtitleName", () => {
	it("puts the language where players look for it, numbered when repeated", () => {
		const taken = new Set<string>();
		const name = (lang: string, sdh = false) => {
			const result = subtitleName("Heat", { lang, sdh }, (n) => taken.has(n));
			taken.add(result);
			return result;
		};
		expect(name("en")).toBe("Heat.en.srt");
		expect(name("en", true)).toBe("Heat.en.sdh.srt");
		expect(name("en")).toBe("Heat.en.2.srt");
		expect(name("pt/BR")).toBe("Heat.ptBR.srt");
		expect(name("")).toBe("Heat.und.srt");
	});
});
