import { describe, expect, it } from "vitest";
import type { EngineTrack } from "./desktop-mpv.ts";
import {
	activeEngineCaption,
	engineAudioTracks,
	engineCaptionCommand,
	engineSubtitleOptions,
	preferredEngineAudio,
	preferredEngineCaption,
} from "./engine-tracks.ts";

const track = (fields: Partial<EngineTrack>): EngineTrack => ({
	id: 1,
	type: "audio",
	lang: "",
	title: "",
	selected: false,
	external: null,
	...fields,
});
const name = (number: number) => `Track ${number}`;

const TRACKS = [
	track({ id: 1, type: "audio", lang: "eng", selected: true }),
	track({ id: 2, type: "audio", lang: "fre", title: "VFF" }),
	track({ id: 1, type: "sub", lang: "eng" }),
	track({ id: 2, type: "sub", title: "Signs" }),
	track({
		id: 3,
		type: "sub",
		lang: "fr",
		external: "https://subs.example/fr.srt",
		selected: true,
	}),
];
const ADDON = [
	{ lang: "fr", url: "https://subs.example/fr.srt" },
	{ lang: "es", url: "https://subs.example/es.srt" },
	{ lang: "es", url: "https://subs.example/es.srt" },
	{ lang: "de", url: "file:///etc/passwd" },
];

describe("engineSubtitleOptions", () => {
	it("lists the file's own tracks, then each addon subtitle once", () => {
		const options = engineSubtitleOptions(TRACKS, ADDON, "en", name);
		expect(options.map((option) => [option.key, option.name])).toEqual([
			["mpv:1", "English"],
			["mpv:2", "Signs"],
			["addon:https://subs.example/fr.srt", "French"],
			["addon:https://subs.example/es.srt", "Spanish"],
		]);
		expect(options[0].embedded).toBe(true);
	});
});

describe("activeEngineCaption", () => {
	it("names an added subtitle by its URL, a file's own by its id", () => {
		expect(activeEngineCaption(TRACKS)).toBe(
			"addon:https://subs.example/fr.srt",
		);
		expect(
			activeEngineCaption([track({ id: 4, type: "sub", selected: true })]),
		).toBe("mpv:4");
		expect(activeEngineCaption([track({ type: "sub" })])).toBeNull();
	});
});

describe("engineCaptionCommand", () => {
	const options = engineSubtitleOptions(TRACKS, ADDON, "en", name);

	it("selects a file's track, adds an addon's, or turns them off", () => {
		expect(engineCaptionCommand("mpv:2", options)).toEqual({
			op: "subtitle",
			id: 2,
		});
		expect(
			engineCaptionCommand("addon:https://subs.example/es.srt", options),
		).toEqual({
			op: "subtitle-add",
			url: "https://subs.example/es.srt",
			lang: "es",
		});
		expect(engineCaptionCommand(null, options)).toEqual({
			op: "subtitle",
			id: null,
		});
		expect(
			engineCaptionCommand("addon:https://other/x.srt", options),
		).toBeNull();
	});
});

describe("engineAudioTracks", () => {
	it("labels a track by its title, else its language", () => {
		expect(engineAudioTracks(TRACKS, name)).toEqual([
			{ id: 1, label: "eng", selected: true },
			{ id: 2, label: "VFF", selected: false },
		]);
		expect(engineAudioTracks([track({ id: 7 })], name)[0].label).toBe(
			"Track 1",
		);
	});
});

describe("preferredEngineAudio", () => {
	it("switches to the wanted language, and not when it already plays", () => {
		expect(preferredEngineAudio(TRACKS, ["fr"])).toBe(2);
		expect(preferredEngineAudio(TRACKS, ["en"])).toBeNull();
		expect(preferredEngineAudio(TRACKS, ["ja"])).toBeNull();
	});
});

describe("preferredEngineCaption", () => {
	it("takes the file's own track in the language first", () => {
		const options = engineSubtitleOptions(TRACKS, ADDON, "en", name);
		expect(preferredEngineCaption(options, "en")).toBe("mpv:1");
		expect(preferredEngineCaption(options, "es")).toBe(
			"addon:https://subs.example/es.srt",
		);
		expect(preferredEngineCaption(options, "")).toBeNull();
	});
});
