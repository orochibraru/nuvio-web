import { describe, expect, it } from "vitest";
import {
	audioLanguageTargets,
	audioTrackName,
	languageKey,
	preferredTrackIndex,
} from "./audio-language.ts";

describe("languageKey", () => {
	it("folds every spelling of a language onto one key", () => {
		for (const code of ["fr", "FR", "fra", "fre", "fr-CA", "fr_FR"]) {
			expect(languageKey(code)).toBe("fr");
		}
		expect(languageKey("ita")).toBe("it");
		expect(languageKey("ger")).toBe("de");
		expect(languageKey("chi")).toBe("zh");
	});

	it("is null for nothing, `und` and garbage", () => {
		expect(languageKey("")).toBeNull();
		expect(languageKey(null)).toBeNull();
		expect(languageKey("und")).toBeNull();
		expect(languageKey("!!")).toBeNull();
	});
});

describe("audioLanguageTargets", () => {
	it("puts the preference first, then the secondary", () => {
		expect(audioLanguageTargets("fre", "eng", ["de-DE"])).toEqual(["fr", "en"]);
	});

	it("uses the browser's languages for `device`", () => {
		expect(
			audioLanguageTargets("device", "it", ["fr-FR", "en-US", "fr"]),
		).toEqual(["fr", "en", "it"]);
	});

	it("looks for the file's original track first, then the secondary", () => {
		expect(audioLanguageTargets("original", "en", ["fr"])).toEqual([
			"original",
			"en",
		]);
	});

	it("leaves the file's default alone for default and empty", () => {
		expect(audioLanguageTargets("default", null, ["fr"])).toEqual([]);
		expect(audioLanguageTargets("", undefined, ["fr"])).toEqual([]);
		expect(audioLanguageTargets("fr", "device", ["en"])).toEqual(["fr"]);
	});
});

describe("preferredTrackIndex", () => {
	const tracks = [{ language: "ita" }, { language: "eng" }, { language: "" }];

	it("finds the track in the best-ranked language", () => {
		expect(preferredTrackIndex(tracks, ["en"])).toBe(1);
		expect(preferredTrackIndex(tracks, ["fr", "it"])).toBe(0);
	});

	it("finds the track flagged original", () => {
		const flagged = [...tracks, { language: "jpn", original: true }];
		expect(preferredTrackIndex(flagged, ["original", "en"])).toBe(3);
		expect(preferredTrackIndex(tracks, ["original", "en"])).toBe(1);
	});

	it("is -1 when nothing matches or nothing is wanted", () => {
		expect(preferredTrackIndex(tracks, ["fr"])).toBe(-1);
		expect(preferredTrackIndex(tracks, [])).toBe(-1);
	});
});

describe("audioTrackName", () => {
	it("names a bare language code in the viewer's locale", () => {
		expect(audioTrackName("fr", "fr")).toBe("Français");
		expect(audioTrackName("en", "fr")).toBe("Anglais");
		expect(audioTrackName("fr", "en")).toBe("French");
		expect(audioTrackName("eng", "en")).toBe("English");
		expect(audioTrackName("ger", "en")).toBe("German");
		expect(audioTrackName("FRE", "en")).toBe("French");
	});

	it("keeps the region a tag carries", () => {
		expect(audioTrackName("pt-BR", "en")).toBe("Brazilian Portuguese");
		expect(audioTrackName("fr_CA", "en")).toBe("Canadian French");
	});

	it("leaves a real track name alone", () => {
		for (const label of [
			"VF",
			"English 5.1",
			"Track 2",
			"Commentary",
			"und",
			"",
		]) {
			expect(audioTrackName(label, "en")).toBe(label);
		}
	});
});
