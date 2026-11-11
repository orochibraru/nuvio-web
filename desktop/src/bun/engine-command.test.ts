import { describe, expect, it } from "vitest";
import { parseEngineCommand, parseTracks } from "./engine-command.ts";

describe("parseTracks", () => {
	it("keeps the audio and subtitle tracks, and where an added one came from", () => {
		const json = JSON.stringify([
			{ id: 1, type: "video", selected: true },
			{ id: 1, type: "audio", lang: "eng", title: "Stereo", selected: true },
			{ id: 2, type: "audio", lang: "fre" },
			{ id: 1, type: "sub", lang: "eng", external: false },
			{
				id: 2,
				type: "sub",
				external: true,
				"external-filename": "https://subs.example/fr.srt",
				selected: true,
			},
		]);
		expect(parseTracks(json)).toEqual([
			{
				id: 1,
				type: "audio",
				lang: "eng",
				title: "Stereo",
				selected: true,
				external: null,
			},
			{
				id: 2,
				type: "audio",
				lang: "fre",
				title: "",
				selected: false,
				external: null,
			},
			{
				id: 1,
				type: "sub",
				lang: "eng",
				title: "",
				selected: false,
				external: null,
			},
			{
				id: 2,
				type: "sub",
				lang: "",
				title: "",
				selected: true,
				external: "https://subs.example/fr.srt",
			},
		]);
	});

	it("is empty on anything that isn't a track list", () => {
		expect(parseTracks("not json")).toEqual([]);
		expect(parseTracks('{"id":1}')).toEqual([]);
	});
});

describe("parseEngineCommand", () => {
	it("takes track picks by positive integer id, or no subtitle", () => {
		expect(parseEngineCommand({ op: "audio", id: 2 })).toEqual({
			op: "audio",
			id: 2,
		});
		expect(parseEngineCommand({ op: "subtitle", id: null })).toEqual({
			op: "subtitle",
			id: null,
		});
		expect(parseEngineCommand({ op: "audio", id: 0 })).toBeNull();
		expect(parseEngineCommand({ op: "audio", id: "2" })).toBeNull();
		expect(parseEngineCommand({ op: "subtitle", id: 1.5 })).toBeNull();
	});

	it("adds only an http(s) subtitle with a plain language tag", () => {
		expect(
			parseEngineCommand({
				op: "subtitle-add",
				url: "https://subs.example/fr.srt",
				lang: "fr",
			}),
		).toEqual({
			op: "subtitle-add",
			url: "https://subs.example/fr.srt",
			lang: "fr",
		});
		for (const command of [
			{ op: "subtitle-add", url: "file:///etc/passwd", lang: "fr" },
			{ op: "subtitle-add", url: "https://a.example/x\nquit", lang: "fr" },
			{ op: "subtitle-add", url: "https://a.example/x", lang: "fr\nquit" },
		]) {
			expect(parseEngineCommand(command)).toBeNull();
		}
	});

	it("takes a style only with a known size and a hex colour", () => {
		const style = {
			op: "subtitle-style",
			size: "large",
			color: "#ffcc00",
			background: true,
			outline: false,
		};
		expect(parseEngineCommand(style)).toEqual(style);
		expect(parseEngineCommand({ ...style, size: "huge" })).toBeNull();
		expect(parseEngineCommand({ ...style, color: "red; quit" })).toBeNull();
	});
});
