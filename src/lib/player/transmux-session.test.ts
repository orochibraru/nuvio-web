import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareTransmux } from "./transmux-session.ts";

const source = vi.hoisted(() => ({
	tracks: [] as {
		id: number;
		languageCode: string;
		name: string;
		codec: string;
		getCodecParameterString: () => Promise<string>;
	}[],
	dispose: vi.fn(),
}));

vi.mock("@mediabunny/ac3", () => ({ registerAc3Decoder: vi.fn() }));
vi.mock("@mediabunny/dts", () => ({ registerDtsDecoder: vi.fn() }));
vi.mock("#lib/i18n/index.js", () => ({
	m: {
		player_audio_track_fallback: ({ number }: { number: number }) =>
			`Track ${number}`,
	},
}));
vi.mock("mediabunny", () => ({
	Input: class {
		getPrimaryVideoTrack = async () => ({
			getCodecParameterString: async () => "avc1.42001e",
		});
		getAudioTracks = async () => source.tracks;
		getPrimaryAudioTrack = async () => source.tracks[0];
		computeDuration = async () => 60;
		dispose = source.dispose;
	},
	UrlSource: class {},
	EncodedPacketSink: class {},
	Mp4OutputFormat: class {
		getSupportedCodecs = () => ["aac"];
	},
	getFirstEncodableAudioCodec: async () => "aac",
	Conversion: class {},
	Output: class {},
	StreamTarget: class {},
	MATROSKA: {},
	MP4: {},
}));

describe("direct-file audio selection", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		source.dispose.mockClear();
		source.tracks = ["eng", "hin"].map((languageCode, id) => ({
			id,
			languageCode,
			name: languageCode,
			codec: "aac",
			getCodecParameterString: async () => "mp4a.40.2",
		}));
		vi.stubGlobal("MediaSource", { isTypeSupported: () => true });
		vi.stubGlobal("document", {
			createElement: () => ({ canPlayType: () => "probably" }),
		});
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("exposes both playable tracks when the browser has no native selector", async () => {
		const session = await prepareTransmux(
			"https://example.test/multi.mp4",
			"probe",
			{ languages: [], track: null },
		);
		expect(session?.audioTracks.map((track) => track.language)).toEqual([
			"eng",
			"hin",
		]);
		expect(session?.converting).toBe(false);
		session?.dispose();
		expect(source.dispose).toHaveBeenCalledOnce();
	});

	it("keeps a playable single-track file on native playback", async () => {
		source.tracks = source.tracks.slice(0, 1);
		expect(
			await prepareTransmux("https://example.test/single.mp4", "probe", {
				languages: [],
				track: null,
			}),
		).toBeNull();
		expect(source.dispose).toHaveBeenCalledOnce();
	});

	it("keeps native playback when the browser provides track selection", async () => {
		vi.stubGlobal("document", {
			createElement: () => ({ audioTracks: [], canPlayType: () => "probably" }),
		});
		expect(
			await prepareTransmux("https://example.test/multi.mp4", "probe", {
				languages: [],
				track: null,
			}),
		).toBeNull();
	});

	it("starts the fallback on the preferred language", async () => {
		const session = await prepareTransmux(
			"https://example.test/multi.mp4",
			"probe",
			{ languages: ["hi"], track: null },
		);
		expect(session?.activeAudioTrack).toBe(1);
		session?.dispose();
	});
});
