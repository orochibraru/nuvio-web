import { describe, expect, it } from "vitest";
import { groupSubtitles } from "./subtitle-groups.ts";
import type { SubtitleOption } from "./types.ts";

const track = (key: string, lang: string, name: string): SubtitleOption => ({
	key,
	lang,
	name,
	url: `https://subs.example/${key}.srt`,
	addonName: "OpenSubtitles",
});

const options = [
	track("a", "spa", "Spanish"),
	track("b", "eng", "English"),
	track("c", "fre", "French"),
	track("d", "eng", "English"),
];

describe("groupSubtitles", () => {
	it("groups by language and keeps addon order inside a group", () => {
		const groups = groupSubtitles(options, "");
		expect(groups.map((group) => group.name)).toEqual([
			"English",
			"French",
			"Spanish",
		]);
		expect(groups[0].options.map((option) => option.key)).toEqual(["b", "d"]);
	});

	it("puts the preferred language first", () => {
		expect(groupSubtitles(options, "fre")[0].name).toBe("French");
		expect(groupSubtitles(options, "es")[0].name).toBe("Spanish");
	});

	it("is empty with no tracks", () => {
		expect(groupSubtitles([], "eng")).toEqual([]);
	});
});
