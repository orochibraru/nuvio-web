import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	blockText,
	type MkvTextBlock,
	MkvTextExtractor,
	type MkvTextTrack,
	parseMkvTextTracks,
} from "./mkv-text.ts";

const encoder = new TextEncoder();

function idBytes(id: number): number[] {
	const bytes: number[] = [];
	for (let value = id; value > 0; value = Math.floor(value / 256)) {
		bytes.unshift(value % 256);
	}
	return bytes;
}

// Every size as an 8-byte vint keeps the fixture simple; `null` is "unknown".
function sizeBytes(size: number | null): number[] {
	if (size === null) {
		return [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
	}
	const bytes = [0x01];
	for (let shift = 6; shift >= 0; shift -= 1) {
		bytes.push(Math.floor(size / 256 ** shift) % 256);
	}
	return bytes;
}

function ebml(id: number, ...payload: (Uint8Array | number[])[]): Uint8Array {
	const body = payload.flatMap((part) => [...part]);
	return new Uint8Array([...idBytes(id), ...sizeBytes(body.length), ...body]);
}

const unknown = (id: number) =>
	new Uint8Array([...idBytes(id), ...sizeBytes(null)]);
const uintBytes = (value: number) => [value >> 8, value & 0xff];
const str = (value: string) => encoder.encode(value);

function trackEntry(
	number: number,
	type: number,
	codec: string,
	extra: Uint8Array[] = [],
) {
	return ebml(
		0xae,
		ebml(0xd7, [number]),
		ebml(0x83, [type]),
		ebml(0x86, str(codec)),
		...extra,
	);
}

function block(track: number, relative: number, data: Uint8Array) {
	return [0x80 | track, ...uintBytes(relative & 0xff_ff), 0x00, ...data];
}

function blockGroup(
	track: number,
	relative: number,
	duration: number,
	data: Uint8Array,
) {
	return ebml(
		0xa0,
		ebml(0xa1, block(track, relative, data)),
		ebml(0x9b, uintBytes(duration)),
	);
}

const TRACKS = ebml(
	0x16_54_ae_6b,
	trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
	trackEntry(2, 17, "S_TEXT/UTF8", [
		ebml(0x22_b5_9c, str("fre")),
		ebml(0x53_6e, str("Français")),
	]),
	trackEntry(3, 17, "S_TEXT/ASS", [ebml(0x22_b5_9c, str("und"))]),
	trackEntry(4, 17, "S_HDMV/PGS"),
	trackEntry(5, 17, "S_TEXT/UTF8", [
		ebml(0x6d_80, ebml(0x62_40, ebml(0x50_34, ebml(0x42_54, [0])))),
	]),
);

const junk = new Uint8Array(5000).map((_, index) => (index * 37) % 251);

function cluster(time: number, ...blocks: Uint8Array[]) {
	return ebml(0x1f_43_b6_75, ebml(0xe7, uintBytes(time)), ...blocks);
}

const HEAD = new Uint8Array([
	...ebml(0x1a_45_df_a3, ebml(0x42_86, [1])),
	...unknown(0x18_53_80_67),
	...ebml(0x15_49_a9_66, ebml(0x2a_d7_b1, [0x0f, 0x42, 0x40])),
	...TRACKS,
]);
const FIRST = cluster(
	1000,
	ebml(0xa3, block(1, 0, junk)),
	blockGroup(2, 500, 1500, str("Bonjour\r\nà tous")),
	blockGroup(1, 40, 40, junk),
);
const SECOND = cluster(
	5000,
	ebml(0xa3, block(1, 0, junk)),
	blockGroup(3, -200, 2000, str("0,0,Default,,0,0,0,,{\\i1}Hi, there{\\i0}")),
	ebml(0xa3, block(2, 1000, str("No duration"))),
);
const FILE = new Uint8Array([...HEAD, ...FIRST, ...SECOND]);
const SECOND_START = HEAD.length + FIRST.length;

function run(chunks: [number, Uint8Array][]) {
	const tracks: MkvTextTrack[][] = [];
	const blocks: MkvTextBlock[] = [];
	const extractor = new MkvTextExtractor(
		(found) => tracks.push(found),
		(found) => blocks.push(found),
	);
	for (const [start, bytes] of chunks) {
		const push = extractor.stream(start);
		for (let offset = 0; offset < bytes.length; offset += 777) {
			push(bytes.subarray(offset, offset + 777));
		}
	}
	return { tracks, blocks };
}

const summary = (blocks: MkvTextBlock[]) =>
	blocks.map(({ track, start, end }) => ({ track, start, end }));

const EXPECTED = [
	{ track: 2, start: 1.5, end: 3 },
	{ track: 3, start: 4.8, end: 6.8 },
	{ track: 2, start: 6, end: 10 },
];

describe("parseMkvTextTracks", () => {
	it("keeps text subtitle tracks with their language and name", () => {
		const tracks = parseMkvTextTracks(TRACKS, 12);
		expect(
			tracks.map(({ number, codec, language, name }) => ({
				number,
				codec,
				language,
				name,
			})),
		).toEqual([
			{ number: 2, codec: "utf8", language: "fre", name: "Français" },
			{ number: 3, codec: "ass", language: "", name: "" },
			{ number: 5, codec: "utf8", language: "eng", name: "" },
		]);
		expect(tracks[2].compression?.algorithm).toBe(0);
	});
});

describe("MkvTextExtractor", () => {
	it("finds every text block in one sequential read, video blocks skipped", () => {
		const { tracks, blocks } = run([[0, FILE]]);
		expect(tracks).toHaveLength(1);
		expect(summary(blocks)).toEqual(EXPECTED);
		expect(new TextDecoder().decode(blocks[0].data)).toBe("Bonjour\r\nà tous");
	});

	it("resumes a parse when the next response starts where the last stopped", () => {
		const cut = HEAD.length + 2500;
		const { blocks } = run([
			[0, FILE.subarray(0, cut)],
			[cut, FILE.subarray(cut)],
		]);
		expect(summary(blocks)).toEqual(EXPECTED);
	});

	it("skips to the next Cluster when a response starts mid-element", () => {
		const { blocks } = run([
			[0, HEAD],
			[SECOND_START - 50, FILE.subarray(SECOND_START - 50)],
		]);
		expect(summary(blocks)).toEqual(EXPECTED.slice(1));
	});

	it("drops blocks it sees before the file's tracks", () => {
		const { blocks } = run([[HEAD.length, FILE.subarray(HEAD.length)]]);
		expect(blocks).toEqual([]);
	});
});

describe("blockText", () => {
	const track = (
		codec: MkvTextTrack["codec"],
		compression: MkvTextTrack["compression"] = null,
	): MkvTextTrack => ({
		number: 2,
		codec,
		language: "",
		name: "",
		compression,
	});

	it("keeps SRT text and drops carriage returns", async () => {
		expect(
			await blockText(track("utf8"), str("<i>Bonjour</i>\r\nà tous")),
		).toBe("<i>Bonjour</i>\nà tous");
	});

	it("takes an ASS event's Text field and strips its tags", async () => {
		expect(
			await blockText(
				track("ass"),
				str("3,0,Default,,0,0,0,,{\\b1}Hi, there\\Nyou"),
			),
		).toBe("Hi, there\nyou");
	});

	it("undoes zlib and header-stripping compression", async () => {
		const zlib = new Uint8Array(deflateSync(Buffer.from("Compressé")));
		expect(
			await blockText(
				track("utf8", { algorithm: 0, settings: new Uint8Array(0) }),
				zlib,
			),
		).toBe("Compressé");
		expect(
			await blockText(
				track("utf8", { algorithm: 3, settings: str("Bon") }),
				str("jour"),
			),
		).toBe("Bonjour");
	});
});
