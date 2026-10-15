/** An MP4 chapter track's sample tables, read out of their box payloads. Pure. */

const MAX_CHAPTERS = 1024;

const utf8 = new TextDecoder();

export function dataView(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The payloads of a chapter track's `mdhd`, `elst` and sample table boxes. */
export interface SampleTables {
	mdhd: Uint8Array;
	/** The track's edit list, if any, and the movie's timescale it counts in. */
	elst: Uint8Array | null;
	movieTimescale: number;
	stts: Uint8Array;
	stsc: Uint8Array;
	/** `stsz`, or `stz2` (4, 8 or 16-bit sizes) when `compact`. */
	sizes: Uint8Array;
	compact: boolean;
	/** `stco` (32-bit chunk offsets), or `co64` when `wide`. */
	chunkOffsets: Uint8Array;
	wide: boolean;
}

/** One sample of a chapter track : `start` in seconds, `offset` from the start of the file. */
interface ChapterSample {
	start: number;
	offset: number;
	size: number;
}

/** The start, in seconds, of each of the first `count` samples of an `stts`. */
function sampleStarts(
	stts: DataView,
	timescale: number,
	count: number,
): number[] {
	const starts: number[] = [];
	const entries = stts.getUint32(4);
	let time = 0;
	for (let entry = 0; entry < entries && starts.length < count; entry += 1) {
		const sampleCount = stts.getUint32(8 + entry * 8);
		const delta = stts.getUint32(12 + entry * 8);
		for (let i = 0; i < sampleCount && starts.length < count; i += 1) {
			starts.push(time / timescale);
			time += delta;
		}
	}
	return starts;
}

/** The timescale of an `mvhd` or `mdhd` payload. */
export function timescaleOf(header: DataView): number {
	return header.getUint32(header.getUint8(0) === 1 ? 20 : 12);
}

/** The size of sample `index`, out of an `stsz` or an `stz2`. */
function sampleSize(sizes: DataView, compact: boolean, index: number): number {
	if (!compact) {
		return sizes.getUint32(4) || sizes.getUint32(12 + index * 4);
	}
	const bits = sizes.getUint8(7);
	if (bits === 4) {
		return (sizes.getUint8(12 + (index >> 1)) >> (index % 2 ? 0 : 4)) & 0xf;
	}
	return bits === 8
		? sizes.getUint8(12 + index)
		: sizes.getUint16(12 + index * 2);
}

/** Seconds from media time to movie time : empty edits delay, the first real edit trims. */
function editShift(
	elst: DataView | null,
	movieTimescale: number,
	mediaTimescale: number,
): number {
	if (!elst) {
		return 0;
	}
	const wide = elst.getUint8(0) === 1;
	const entrySize = wide ? 20 : 12;
	let delay = 0;
	for (let entry = 0; entry < elst.getUint32(4); entry += 1) {
		const pos = 8 + entry * entrySize;
		const duration = wide
			? Number(elst.getBigUint64(pos))
			: elst.getUint32(pos);
		const mediaTime = wide
			? Number(elst.getBigInt64(pos + 8))
			: elst.getInt32(pos + 4);
		if (mediaTime !== -1) {
			return delay / movieTimescale - mediaTime / mediaTimescale;
		}
		delay += duration;
	}
	return delay / movieTimescale;
}

/** Where and when each sample of a chapter track is. Throws on a truncated table. */
export function chapterSamples(tables: SampleTables): ChapterSample[] {
	const timescale = timescaleOf(dataView(tables.mdhd));
	const stsc = dataView(tables.stsc);
	const sizes = dataView(tables.sizes);
	const chunkOffsets = dataView(tables.chunkOffsets);
	const shift = editShift(
		tables.elst && dataView(tables.elst),
		tables.movieTimescale,
		timescale,
	);
	const starts = sampleStarts(
		dataView(tables.stts),
		timescale,
		Math.min(sizes.getUint32(8), MAX_CHAPTERS),
	).map((start) => start + shift);

	const samples: ChapterSample[] = [];
	const chunkCount = chunkOffsets.getUint32(4);
	const runCount = stsc.getUint32(4);
	let run = 0;
	for (let chunk = 1; chunk <= chunkCount; chunk += 1) {
		// An `stsc` entry applies from its first chunk (1-based) up to the next entry's.
		while (run + 1 < runCount && stsc.getUint32(8 + (run + 1) * 12) <= chunk) {
			run += 1;
		}
		const samplesPerChunk = stsc.getUint32(12 + run * 12);
		let offset = tables.wide
			? Number(chunkOffsets.getBigUint64(8 + (chunk - 1) * 8))
			: chunkOffsets.getUint32(8 + (chunk - 1) * 4);
		for (let i = 0; i < samplesPerChunk; i += 1) {
			if (samples.length === starts.length) {
				return samples;
			}
			const size = sampleSize(sizes, tables.compact, samples.length);
			samples.push({ start: starts[samples.length], offset, size });
			offset += size;
		}
	}
	return samples;
}

/** A chapter track sample → its title : a 16-bit length, then UTF-8, or UTF-16 after a BOM. */
export function chapterTitle(sample: Uint8Array): string | null {
	if (sample.length < 2) {
		return null;
	}
	const text = sample.subarray(2, 2 + dataView(sample).getUint16(0));
	let decoder = utf8;
	if (text[0] === 0xfe && text[1] === 0xff) {
		decoder = new TextDecoder("utf-16be");
	} else if (text[0] === 0xff && text[1] === 0xfe) {
		decoder = new TextDecoder("utf-16le");
	}
	return decoder.decode(text).trim() || null;
}
