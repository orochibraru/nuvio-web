/**
 * Chapter markers for the scrub bar.
 *
 * Embedded chapters are read **in the browser**, from the container's own
 * metadata, with a handful of small `Range` requests : Matroska `Chapters` and
 * MP4 Nero `chpl`. The server never touches a stream's bytes (the app hosts no
 * media), and the reads stop before any media data: a Matroska walk ends at the
 * first `Cluster`, an MP4 walk skips `mdat` by its size. A host that answers
 * without CORS or ignores `Range` just yields no chapters.
 *
 * When the file has none, TheIntroDB / AniSkip segments stand in.
 */

/** One chapter : `start` in seconds, `title` null for an unnamed stretch. */
export interface Chapter {
	start: number;
	title: string | null;
}

/** Reads `length` bytes at `offset`, or `null` when that isn't possible. */
export type ReadRange = (
	offset: number,
	length: number,
) => Promise<Uint8Array | null>;

const HEAD_BYTES = 64 * 1024;
/** A chapter list is kilobytes; anything past this is not one worth reading. */
const MAX_ELEMENT_BYTES = 1024 * 1024;
// ponytail: one read per MP4 box header, so a moov with many traks walks them one by one; read the whole moov in one go if this cap bites.
const MAX_READS = 24;

const utf8 = new TextDecoder();

// -- Matroska ------------------------------------------------------------------

const EBML_MAGIC = 0x1a_45_df_a3;
const SEGMENT = 0x18_53_80_67;
const SEEK_HEAD = 0x11_4d_9b_74;
const SEEK = 0x4d_bb;
const SEEK_ID = 0x53_ab;
const SEEK_POSITION = 0x53_ac;
const CLUSTER = 0x1f_43_b6_75;
const CHAPTERS = 0x10_43_a7_70;
const EDITION_ENTRY = 0x45_b9;
const CHAPTER_ATOM = 0xb6;
const CHAPTER_TIME_START = 0x91;
const CHAPTER_FLAG_HIDDEN = 0x98;
const CHAPTER_FLAG_ENABLED = 0x45_98;
const CHAPTER_DISPLAY = 0x80;
const CHAP_STRING = 0x85;

interface Element {
	id: number;
	/** Payload size, or -1 for "unknown" (a live-muxed Segment / Cluster). */
	size: number;
	/** Offset of the payload, relative to the buffer. */
	data: number;
}

/** An EBML variable-length integer at `pos`; `keepMarker` for element ids. */
function vint(
	bytes: Uint8Array,
	pos: number,
	keepMarker: boolean,
): { value: number; length: number } | null {
	const first = bytes[pos];
	if (first === undefined || first === 0) {
		return null;
	}
	const length = Math.clz32(first) - 23;
	if (pos + length > bytes.length) {
		return null;
	}
	let value = keepMarker ? first : first & (0xff >> length);
	let allOnes = value === 0xff >> length;
	for (let i = 1; i < length; i += 1) {
		value = value * 256 + bytes[pos + i];
		allOnes &&= bytes[pos + i] === 0xff;
	}
	return { value: !keepMarker && allOnes ? -1 : value, length };
}

function element(bytes: Uint8Array, pos: number): Element | null {
	const id = vint(bytes, pos, true);
	if (!id) {
		return null;
	}
	const size = vint(bytes, pos + id.length, false);
	if (!size) {
		return null;
	}
	return {
		id: id.value,
		size: size.value,
		data: pos + id.length + size.length,
	};
}

/** The direct children of `[start, end)`. */
function* children(bytes: Uint8Array, start: number, end: number) {
	let pos = start;
	while (pos < end) {
		const child = element(bytes, pos);
		if (!child || child.size < 0 || child.data + child.size > end) {
			return;
		}
		yield child;
		pos = child.data + child.size;
	}
}

function uint(bytes: Uint8Array, el: Element): number {
	let value = 0;
	for (let i = 0; i < el.size; i += 1) {
		value = value * 256 + bytes[el.data + i];
	}
	return value;
}

/** The children of `el` (a parsed master element). */
function inside(bytes: Uint8Array, el: Element) {
	return children(bytes, el.data, el.data + el.size);
}

/** A `ChapterDisplay`'s title string. */
function displayTitle(bytes: Uint8Array, display: Element): string | null {
	for (const field of inside(bytes, display)) {
		if (field.id === CHAP_STRING) {
			const text = utf8
				.decode(bytes.subarray(field.data, field.data + field.size))
				.trim();
			return text || null;
		}
	}
	return null;
}

/** A `ChapterAtom` → a chapter, or null when it is hidden or disabled. */
function parseAtom(bytes: Uint8Array, atom: Element): Chapter | null {
	let startNs = 0;
	let title: string | null = null;
	let visible = true;
	for (const field of inside(bytes, atom)) {
		switch (field.id) {
			case CHAPTER_TIME_START:
				startNs = uint(bytes, field);
				break;
			case CHAPTER_FLAG_HIDDEN:
				visible &&= uint(bytes, field) === 0;
				break;
			case CHAPTER_FLAG_ENABLED:
				visible &&= uint(bytes, field) !== 0;
				break;
			case CHAPTER_DISPLAY:
				title ??= displayTitle(bytes, field);
				break;
			default:
				break;
		}
	}
	return visible ? { start: startNs / 1e9, title } : null;
}

/** A `Chapters` element's payload → the first edition's visible chapters. */
export function parseMkvChapters(
	bytes: Uint8Array,
	start = 0,
	end = bytes.length,
): Chapter[] {
	for (const edition of children(bytes, start, end)) {
		if (edition.id !== EDITION_ENTRY) {
			continue;
		}
		// The first edition is the default one; later editions are alternates.
		return tidy(
			[...inside(bytes, edition)]
				.filter((atom) => atom.id === CHAPTER_ATOM)
				.map((atom) => parseAtom(bytes, atom))
				.filter((chapter) => chapter !== null),
		);
	}
	return [];
}

/** Where a `SeekHead` says `Chapters` lives : its positions count from `origin`. */
function seekChapters(
	bytes: Uint8Array,
	seekHead: Element,
	origin: number,
): number | null {
	for (const seek of inside(bytes, seekHead)) {
		if (seek.id !== SEEK) {
			continue;
		}
		let id = 0;
		let position: number | null = null;
		for (const field of inside(bytes, seek)) {
			if (field.id === SEEK_ID) {
				id = uint(bytes, field);
			} else if (field.id === SEEK_POSITION) {
				position = uint(bytes, field);
			}
		}
		if (id === CHAPTERS && position !== null) {
			return origin + position;
		}
	}
	return null;
}

/** Offset of the Segment's payload : right after the EBML header. */
function segmentPayload(head: Uint8Array): number | null {
	const header = element(head, 0);
	if (!header || header.size < 0) {
		return null;
	}
	const segment = element(head, header.data + header.size);
	return segment?.id === SEGMENT ? segment.data : null;
}

/**
 * Walks the Segment's top-level elements inside `head`, up to the first
 * Cluster (media data : never read). Returns the chapters when the whole
 * element is already in `head`, else the absolute offset to fetch it from.
 */
function locateMkvChapters(head: Uint8Array): Chapter[] | number | null {
	const origin = segmentPayload(head);
	if (origin === null) {
		return null;
	}
	// SeekHead positions are relative to the Segment's payload.
	let found: number | null = null;
	let pos = origin;
	while (pos < head.length) {
		const child = element(head, pos);
		if (!child || child.size < 0 || child.id === CLUSTER) {
			break;
		}
		const whole = child.data + child.size <= head.length;
		if (child.id === CHAPTERS) {
			return whole
				? parseMkvChapters(head, child.data, child.data + child.size)
				: pos;
		}
		if (child.id === SEEK_HEAD && whole) {
			found = seekChapters(head, child, origin) ?? found;
		}
		pos = child.data + child.size;
	}
	return found;
}

async function readMkv(head: Uint8Array, read: ReadRange): Promise<Chapter[]> {
	const located = locateMkvChapters(head);
	if (located === null || Array.isArray(located)) {
		return located ?? [];
	}
	// 16 bytes covers any element header; then the payload, if it's small.
	const top = await read(located, 16);
	const chapters = top && element(top, 0);
	if (
		!chapters ||
		chapters.id !== CHAPTERS ||
		chapters.size < 0 ||
		chapters.size > MAX_ELEMENT_BYTES
	) {
		return [];
	}
	const payload = await read(located + chapters.data, chapters.size);
	return payload ? parseMkvChapters(payload) : [];
}

// -- MP4 -----------------------------------------------------------------------

interface Box {
	type: string;
	/** Absolute offset of the payload. */
	data: number;
	/** Absolute end of the box, or `Infinity` for a size-0 "to end of file" box. */
	end: number;
}

function boxAt(bytes: Uint8Array, offset: number): Box | null {
	if (bytes.length < 8) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const type = String.fromCharCode(...bytes.subarray(4, 8));
	let size = view.getUint32(0);
	let header = 8;
	if (size === 1) {
		if (bytes.length < 16) {
			return null;
		}
		size = Number(view.getBigUint64(8));
		header = 16;
	}
	if (size !== 0 && size < header) {
		return null;
	}
	return {
		type,
		data: offset + header,
		end: size === 0 ? Number.POSITIVE_INFINITY : offset + size,
	};
}

/** A Nero `chpl` payload → chapters. Start times are in 100 ns units. */
export function parseChpl(bytes: Uint8Array): Chapter[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// version (1) + flags (3), then 4 unexplained bytes on version 1 (as ffmpeg).
	let pos = bytes[0] ? 8 : 4;
	const count = bytes[pos] ?? 0;
	pos += 1;
	const chapters: Chapter[] = [];
	for (let i = 0; i < count && pos + 9 <= bytes.length; i += 1) {
		const start = Number(view.getBigUint64(pos)) / 1e7;
		const length = bytes[pos + 8];
		const title = utf8.decode(bytes.subarray(pos + 9, pos + 9 + length)).trim();
		chapters.push({ start, title: title || null });
		pos += 9 + length;
	}
	return tidy(chapters);
}

async function readMp4(read: ReadRange): Promise<Chapter[]> {
	/** The first `type` box among the siblings in `[start, end)`. */
	async function find(
		type: string,
		start: number,
		end: number,
	): Promise<Box | null> {
		let pos = start;
		while (pos < end) {
			// biome-ignore lint/performance/noAwaitInLoops: each box's offset comes from the previous box's size
			const header = await read(pos, 16);
			const box = header && boxAt(header, pos);
			if (!box) {
				return null;
			}
			if (box.type === type) {
				return box;
			}
			pos = box.end;
		}
		return null;
	}

	const moov = await find("moov", 0, Number.POSITIVE_INFINITY);
	const udta = moov && (await find("udta", moov.data, moov.end));
	const chpl = udta && (await find("chpl", udta.data, udta.end));
	if (!chpl || chpl.end - chpl.data > MAX_ELEMENT_BYTES) {
		return [];
	}
	const payload = await read(chpl.data, chpl.end - chpl.data);
	return payload ? parseChpl(payload) : [];
}

// -- Shared --------------------------------------------------------------------

/**
 * Sorted, de-duplicated (the later of two same-start chapters wins, so a named
 * one replaces the implicit unnamed opening), and nothing for a single chapter
 * spanning the file.
 */
function tidy(chapters: Chapter[]): Chapter[] {
	const sorted = chapters
		.filter((chapter) => Number.isFinite(chapter.start) && chapter.start >= 0)
		.sort((a, b) => a.start - b.start)
		.filter(
			(chapter, i, all) =>
				i === all.length - 1 || chapter.start < all[i + 1].start,
		);
	return sorted.length > 1 ? sorted : [];
}

/**
 * The file's own chapters, read through `read`. Never throws : anything
 * unreadable is "no chapters". Reads go through a small head cache and a hard
 * cap, so a malformed file can't turn into a crawl.
 */
export async function readChapters(read: ReadRange): Promise<Chapter[]> {
	let reads = 0;
	let head: Uint8Array | null = null;
	const cached: ReadRange = async (offset, length) => {
		if (head && offset + length <= head.length) {
			return head.subarray(offset, offset + length);
		}
		reads += 1;
		return reads > MAX_READS ? null : await read(offset, length);
	};
	try {
		head = await cached(0, HEAD_BYTES);
		if (!head || head.length < 8) {
			return [];
		}
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		if (view.getUint32(0) === EBML_MAGIC) {
			return await readMkv(head, cached);
		}
		if (String.fromCharCode(...head.subarray(4, 8)) === "ftyp") {
			return await readMp4(cached);
		}
		return [];
	} catch {
		return [];
	}
}

/**
 * A browser `ReadRange` over `url`. A single `bytes=` range is a CORS-safelisted
 * header (no preflight); a host that ignores it and answers 200 would start
 * sending the whole file, so that response is aborted unread.
 */
export function rangeReader(url: string, signal: AbortSignal): ReadRange {
	return async (offset, length) => {
		const controller = new AbortController();
		const abort = () => controller.abort();
		signal.addEventListener("abort", abort, { once: true });
		try {
			const response = await fetch(url, {
				headers: { range: `bytes=${offset}-${offset + length - 1}` },
				credentials: "omit",
				signal: controller.signal,
			});
			if (response.status !== 206) {
				controller.abort();
				return null;
			}
			return new Uint8Array(await response.arrayBuffer());
		} catch {
			return null;
		} finally {
			signal.removeEventListener("abort", abort);
		}
	};
}

/** TheIntroDB / AniSkip segments as chapters, for files that carry none. */
export function segmentChapters(
	segments: {
		introStart: number | null;
		introEnd: number | null;
		outroStart: number | null;
	},
	labels: { intro: string; credits: string },
): Chapter[] {
	const { introStart, introEnd, outroStart } = segments;
	const chapters: Chapter[] = [{ start: 0, title: null }];
	if (introStart !== null && introEnd !== null && introEnd > introStart) {
		chapters.push({ start: introStart, title: labels.intro });
		chapters.push({ start: introEnd, title: null });
	}
	if (outroStart !== null && outroStart > 0) {
		chapters.push({ start: outroStart, title: labels.credits });
	}
	return tidy(chapters);
}

/** The chapter playing at `time`, or null before the first one. */
export function chapterAt(chapters: Chapter[], time: number): Chapter | null {
	let current: Chapter | null = null;
	for (const chapter of chapters) {
		if (chapter.start > time) {
			break;
		}
		current = chapter;
	}
	return current;
}
