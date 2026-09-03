import { describe, expect, it } from "vitest";
import { formatTime, languageMatches, languageName } from "./format.ts";

describe("formatTime", () => {
	it("formats under an hour as m:ss", () => {
		expect(formatTime(0)).toBe("0:00");
		expect(formatTime(9)).toBe("0:09");
		expect(formatTime(75)).toBe("1:15");
		expect(formatTime(599)).toBe("9:59");
	});

	it("formats an hour or more as h:mm:ss", () => {
		expect(formatTime(3600)).toBe("1:00:00");
		expect(formatTime(3661)).toBe("1:01:01");
		expect(formatTime(7325)).toBe("2:02:05");
	});

	it("floors fractional seconds and clamps negatives", () => {
		expect(formatTime(75.9)).toBe("1:15");
		expect(formatTime(-5)).toBe("0:00");
	});

	it("returns 0:00 for non-finite input", () => {
		expect(formatTime(Number.NaN)).toBe("0:00");
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
	});
});

describe("languageName", () => {
	it("resolves a 2-letter code to a display name", () => {
		expect(languageName("en")).toBe("English");
		expect(languageName("fr")).toBe("French");
	});

	it("takes the first two letters of a longer tag", () => {
		expect(languageName("en-US")).toBe("English");
		expect(languageName("pt-BR")).toBe("Portuguese");
	});

	it("upper-cases an unrecognised code", () => {
		expect(languageName("zz")).toBe("ZZ");
	});
});

describe("languageMatches", () => {
	it("matches across 2- and 3-letter forms", () => {
		expect(languageMatches("en", "eng")).toBe(true);
		expect(languageMatches("eng", "en")).toBe(true);
		expect(languageMatches("en-US", "en")).toBe(true);
	});

	it("rejects different languages", () => {
		expect(languageMatches("en", "fr")).toBe(false);
		expect(languageMatches("", "en")).toBe(false);
	});
});
