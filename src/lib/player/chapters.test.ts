import { describe, expect, it } from "vitest";
import {
	chapterAt,
	parseChpl,
	type ReadRange,
	readChapters,
	segmentChapters,
} from "./chapters.ts";

// -- Byte builders ---------------------------------------------------------------

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let pos = 0;
	for (const part of parts) {
		out.set(part, pos);
		pos += part.length;
	}
	return out;
}

function be(value: number, bytes: number): Uint8Array {
	const out = new Uint8Array(bytes);
	let rest = BigInt(value);
	for (let i = bytes - 1; i >= 0; i -= 1) {
		out[i] = Number(rest & 0xffn);
		rest >>= 8n;
	}
	return out;
}

/** An EBML element : id bytes as written, size as an 8-byte vint. */
function ebml(id: number, ...payload: Uint8Array[]): Uint8Array {
	const body = concat(...payload);
	const idBytes = be(id, Math.ceil(Math.log2(id + 1) / 8));
	const size = be(body.length, 8);
	size[0] |= 0x01;
	return concat(idBytes, size, body);
}

const text = (value: string) => new TextEncoder().encode(value);

function atom(startNs: number, title: string, hidden = false): Uint8Array {
	return ebml(
		0xb6,
		ebml(0x91, be(startNs, 8)),
		...(hidden ? [ebml(0x98, be(1, 1))] : []),
		ebml(0x80, ebml(0x85, text(title))),
	);
}

const CHAPTERS = ebml(
	0x10_43_a7_70,
	ebml(
		0x45_b9,
		atom(0, "Opening"),
		atom(90e9, "Part A"),
		atom(100e9, "Secret", true),
		atom(600e9, "Ending"),
	),
	// An alternate edition : ignored.
	ebml(0x45_b9, atom(0, "Alt"), atom(5e9, "Alt 2")),
);

const EBML_HEADER = ebml(0x1a_45_df_a3, ebml(0x42_82, text("matroska")));

/** A reader over an in-memory file that records every range it was asked for. */
function fileReader(file: Uint8Array) {
	const reads: Array<[number, number]> = [];
	const read: ReadRange = async (offset, length) => {
		reads.push([offset, length]);
		return file.subarray(offset, offset + length);
	};
	return { read, reads };
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
	const body = concat(...payload);
	return concat(be(8 + body.length, 4), text(type), body);
}

function chpl(version: number, chapters: Array<[number, string]>): Uint8Array {
	return box(
		"chpl",
		new Uint8Array([version, 0, 0, 0]),
		version ? new Uint8Array(4) : new Uint8Array(0),
		new Uint8Array([chapters.length]),
		...chapters.flatMap(([start, title]) => [
			be(start * 1e7, 8),
			new Uint8Array([text(title).length]),
			text(title),
		]),
	);
}

// -- Matroska --------------------------------------------------------------------

describe("readChapters : Matroska", () => {
	it("parses Chapters found in the head, first edition only, hidden atoms dropped", async () => {
		const file = concat(
			EBML_HEADER,
			ebml(0x18_53_80_67, CHAPTERS, ebml(0x1f_43_b6_75, new Uint8Array(32))),
		);
		const { read, reads } = fileReader(file);
		expect(await readChapters(read)).toEqual([
			{ start: 0, title: "Opening" },
			{ start: 90, title: "Part A" },
			{ start: 600, title: "Ending" },
		]);
		expect(reads).toHaveLength(1);
	});

	it("follows the SeekHead to Chapters stored after the media, reading only that element", async () => {
		const cluster = ebml(0x1f_43_b6_75, new Uint8Array(200_000));
		// SeekHead with a fixed-width position, patched once the layout is known.
		const seekHead = (position: number) =>
			ebml(
				0x11_4d_9b_74,
				ebml(
					0x4d_bb,
					ebml(0x53_ab, be(0x10_43_a7_70, 4)),
					ebml(0x53_ac, be(position, 8)),
				),
			);
		const position = seekHead(0).length + cluster.length;
		const segment = ebml(0x18_53_80_67, seekHead(position), cluster, CHAPTERS);
		const file = concat(EBML_HEADER, segment);
		const { read, reads } = fileReader(file);

		const chapters = await readChapters(read);
		expect(chapters.map((chapter) => chapter.title)).toEqual([
			"Opening",
			"Part A",
			"Ending",
		]);
		// Head, then the Chapters header, then its payload : nothing in between.
		const chaptersAt = EBML_HEADER.length + 12 + position;
		expect(reads.slice(1).every(([offset]) => offset >= chaptersAt)).toBe(true);
		expect(reads).toHaveLength(3);
	});

	it("gives up at the first Cluster when nothing points at Chapters", async () => {
		const file = concat(
			EBML_HEADER,
			ebml(0x18_53_80_67, ebml(0x1f_43_b6_75, new Uint8Array(16)), CHAPTERS),
		);
		expect(await readChapters(fileReader(file).read)).toEqual([]);
	});
});

// -- MP4 -------------------------------------------------------------------------

describe("readChapters : MP4", () => {
	const moov = box(
		"moov",
		box("mvhd", new Uint8Array(100)),
		box("trak", new Uint8Array(500)),
		box(
			"udta",
			chpl(1, [
				[0, "Cold open"],
				[62.5, "Titles"],
			]),
		),
	);

	it("skips a large mdat by its size to reach moov/udta/chpl at the end", async () => {
		const mdat = box("mdat", new Uint8Array(300_000));
		const file = concat(box("ftyp", text("isom")), mdat, moov);
		const { read, reads } = fileReader(file);

		expect(await readChapters(read)).toEqual([
			{ start: 0, title: "Cold open" },
			{ start: 62.5, title: "Titles" },
		]);
		// Only headers and the chpl payload past the head : no 64 KiB reads into mdat.
		expect(reads.slice(1).every(([, length]) => length < 1024)).toBe(true);
	});

	it("reads a version 0 chpl", () => {
		const payload = chpl(0, [
			[0, "A"],
			[10, "B"],
		]).subarray(8);
		expect(parseChpl(payload)).toEqual([
			{ start: 0, title: "A" },
			{ start: 10, title: "B" },
		]);
	});
});

// -- Failure modes and fallbacks -------------------------------------------------

describe("readChapters : anything else", () => {
	it("is empty when the host refuses the range", async () => {
		expect(await readChapters(async () => null)).toEqual([]);
	});

	it("is empty for a playlist or an unknown container", async () => {
		const file = text("#EXTM3U\n#EXT-X-VERSION:3\n");
		expect(await readChapters(fileReader(file).read)).toEqual([]);
	});

	it("is empty (never throws) on a truncated Matroska file", async () => {
		const file = concat(EBML_HEADER, ebml(0x18_53_80_67, CHAPTERS)).subarray(
			0,
			60,
		);
		expect(await readChapters(fileReader(file).read)).toEqual([]);
	});
});

describe("segmentChapters", () => {
	const labels = { intro: "Intro", credits: "Credits" };

	it("an intro at 0 replaces the unnamed opening", () => {
		expect(
			segmentChapters(
				{ introStart: 0, introEnd: 80, outroStart: 1300 },
				labels,
			),
		).toEqual([
			{ start: 0, title: "Intro" },
			{ start: 80, title: null },
			{ start: 1300, title: "Credits" },
		]);
	});

	it("a cold open keeps an unnamed stretch before the intro", () => {
		expect(
			segmentChapters(
				{ introStart: 120, introEnd: 200, outroStart: null },
				labels,
			),
		).toEqual([
			{ start: 0, title: null },
			{ start: 120, title: "Intro" },
			{ start: 200, title: null },
		]);
	});

	it("is empty with no segments at all", () => {
		expect(
			segmentChapters(
				{ introStart: null, introEnd: null, outroStart: null },
				labels,
			),
		).toEqual([]);
	});
});

describe("chapterAt", () => {
	const chapters = [
		{ start: 0, title: "A" },
		{ start: 10, title: "B" },
	];

	it("finds the chapter in effect", () => {
		expect(chapterAt(chapters, 9.9)?.title).toBe("A");
		expect(chapterAt(chapters, 10)?.title).toBe("B");
		expect(chapterAt([], 5)).toBeNull();
	});
});
