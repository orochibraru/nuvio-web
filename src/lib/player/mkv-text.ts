import { children, element, inside, uint, vint } from "./chapters.ts";
import { assText } from "./subtitles.ts";

export type MkvTextCodec = "utf8" | "ass" | "webvtt";

export interface MkvTextTrack {
	number: number;
	codec: MkvTextCodec;
	language: string;
	name: string;
	compression: { algorithm: number; settings: Uint8Array } | null;
}

export interface MkvTextBlock {
	track: number;
	start: number;
	end: number;
	data: Uint8Array;
}

const SEGMENT = 0x18_53_80_67;
const CLUSTER = 0x1f_43_b6_75;
const INFO = 0x15_49_a9_66;
const TRACKS = 0x16_54_ae_6b;
const TIMESTAMP_SCALE = 0x2a_d7_b1;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const LANGUAGE = 0x22_b5_9c;
const LANGUAGE_BCP47 = 0x22_b5_9d;
const NAME = 0x53_6e;
const CONTENT_ENCODINGS = 0x6d_80;
const CONTENT_COMPRESSION = 0x50_34;
const CONTENT_COMP_ALGO = 0x42_54;
const CONTENT_COMP_SETTINGS = 0x42_55;
const CONTENT_ENCRYPTION = 0x50_35;
const TIMESTAMP = 0xe7;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const BLOCK_DURATION = 0x9b;
const SUBTITLE_TYPE = 17;
// Elements a walk steps over whole: EBML header, SeekHead, Cues, Chapters, Tags, Attachments, Void, CRC-32, cluster extras.
const SKIPPED = new Set([
	0x1a_45_df_a3, 0x11_4d_9b_74, 0x1c_53_bb_6b, 0x10_43_a7_70, 0x12_54_c3_67,
	0x19_41_a4_69, 0xec, 0xbf, 0x58_54, 0xa7, 0xab, 0xaf,
]);
const COLLECTED = new Set([INFO, TRACKS, TIMESTAMP, SIMPLE_BLOCK, BLOCK_GROUP]);
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_BLOCK_BYTES = 256 * 1024;
const MAX_PARKED = 16;
const DEFAULT_CUE_SECONDS = 4;

const TEXT_CODECS: Record<string, MkvTextCodec> = {
	"S_TEXT/UTF8": "utf8",
	"S_TEXT/ASCII": "utf8",
	"S_TEXT/ASS": "ass",
	"S_TEXT/SSA": "ass",
	"S_TEXT/WEBVTT": "webvtt",
	"D_WEBVTT/SUBTITLES": "webvtt",
	"D_WEBVTT/CAPTIONS": "webvtt",
};

const utf8 = new TextDecoder();

type Element = NonNullable<ReturnType<typeof element>>;

function text(bytes: Uint8Array, el: Element): string {
	return utf8
		.decode(bytes.subarray(el.data, el.data + el.size))
		.replace(/\0+$/, "");
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
	const joined = new Uint8Array(first.length + second.length);
	joined.set(first);
	joined.set(second, first.length);
	return joined;
}

function parseCompression(bytes: Uint8Array, compression: Element) {
	let algorithm = 0;
	let settings = new Uint8Array(0);
	for (const field of inside(bytes, compression)) {
		if (field.id === CONTENT_COMP_ALGO) {
			algorithm = uint(bytes, field);
		} else if (field.id === CONTENT_COMP_SETTINGS) {
			settings = bytes.slice(field.data, field.data + field.size);
		}
	}
	return { algorithm, settings };
}

// Null when a track is encrypted or compressed some way this can't undo.
function parseEncodings(bytes: Uint8Array, encodings: Element) {
	let compression: MkvTextTrack["compression"] = null;
	for (const encoding of inside(bytes, encodings)) {
		for (const part of inside(bytes, encoding)) {
			if (part.id === CONTENT_ENCRYPTION) {
				return null;
			}
			if (part.id === CONTENT_COMPRESSION) {
				compression = parseCompression(bytes, part);
			}
		}
	}
	return compression && ![0, 3].includes(compression.algorithm)
		? null
		: { compression };
}

function parseTrackEntry(bytes: Uint8Array, entry: Element) {
	const track: Record<"number" | "type", number> &
		Record<"codec" | "language" | "bcp47", string> = {
		number: 0,
		type: 0,
		codec: "",
		language: "eng",
		bcp47: "",
	};
	let name = "";
	let encoding: ReturnType<typeof parseEncodings> = { compression: null };
	for (const field of inside(bytes, entry)) {
		switch (field.id) {
			case TRACK_NUMBER:
				track.number = uint(bytes, field);
				break;
			case TRACK_TYPE:
				track.type = uint(bytes, field);
				break;
			case CODEC_ID:
				track.codec = text(bytes, field);
				break;
			case LANGUAGE:
				track.language = text(bytes, field);
				break;
			case LANGUAGE_BCP47:
				track.bcp47 = text(bytes, field);
				break;
			case NAME:
				name = text(bytes, field);
				break;
			case CONTENT_ENCODINGS:
				encoding = parseEncodings(bytes, field);
				break;
			default:
				break;
		}
	}
	const codec = TEXT_CODECS[track.codec];
	if (track.type !== SUBTITLE_TYPE || !codec || !track.number || !encoding) {
		return null;
	}
	const language = track.bcp47 || track.language;
	return {
		number: track.number,
		codec,
		language: language === "und" ? "" : language,
		name,
		compression: encoding.compression,
	};
}

// Image subtitles (PGS, VobSub) are left out.
export function parseMkvTextTracks(
	bytes: Uint8Array,
	start = 0,
	end = bytes.length,
): MkvTextTrack[] {
	return [...children(bytes, start, end)]
		.filter((entry) => entry.id === TRACK_ENTRY)
		.map((entry) => parseTrackEntry(bytes, entry))
		.filter((track) => track !== null);
}

function readBlock(bytes: Uint8Array, start: number, end: number) {
	const track = vint(bytes, start, false);
	if (!track || start + track.length + 3 > end) {
		return null;
	}
	const at = start + track.length;
	const relative = (((bytes[at] << 8) | bytes[at + 1]) << 16) >> 16;
	// Laced blocks carry several frames: never a text one.
	if (bytes[at + 2] & 0x06) {
		return null;
	}
	return {
		track: track.value,
		relative,
		data: bytes.subarray(at + 3, end),
		duration: null as number | null,
	};
}

function readGroup(bytes: Uint8Array, group: Element) {
	let block: ReturnType<typeof readBlock> = null;
	let duration: number | null = null;
	for (const field of inside(bytes, group)) {
		if (field.id === BLOCK) {
			block = readBlock(bytes, field.data, field.data + field.size);
		} else if (field.id === BLOCK_DURATION) {
			duration = uint(bytes, field);
		}
	}
	return block && { ...block, duration };
}

function peekTrack(bytes: Uint8Array, el: Element): number | null {
	if (el.id === SIMPLE_BLOCK) {
		return vint(bytes, el.data, false)?.value ?? null;
	}
	const first = element(bytes, el.data);
	return first?.id === BLOCK
		? (vint(bytes, first.data, false)?.value ?? null)
		: null;
}

// Null until enough bytes are in to tell.
function clusterAt(bytes: Uint8Array, index: number): boolean | null {
	const magic = [0x1f, 0x43, 0xb6, 0x75];
	for (let offset = 1; offset < magic.length; offset += 1) {
		if (index + offset >= bytes.length) {
			return null;
		}
		if (bytes[index + offset] !== magic[offset]) {
			return false;
		}
	}
	const cluster = element(bytes, index);
	const first = cluster && element(bytes, cluster.data);
	if (!first) {
		return bytes.length < index + 24 ? null : false;
	}
	return first.id === TIMESTAMP && first.size >= 1 && first.size <= 8;
}

interface Cursor {
	buffer: Uint8Array;
	position: number;
	skip: number;
	synced: boolean;
	clusterTime: number | null;
}

// One cursor per HTTP response; a response starting where another stopped resumes its parse, one starting mid-element skips to the next Cluster.
export class MkvTextExtractor {
	readonly #parked = new Map<number, Cursor>();
	#scale = 1_000_000;
	#tracks: Map<number, MkvTextTrack> | null = null;
	readonly #onTracks: (tracks: MkvTextTrack[]) => void;
	readonly #onBlock: (block: MkvTextBlock) => void;

	constructor(
		onTracks: (tracks: MkvTextTrack[]) => void,
		onBlock: (block: MkvTextBlock) => void,
	) {
		this.#onTracks = onTracks;
		this.#onBlock = onBlock;
	}

	stream(start: number): (chunk: Uint8Array) => void {
		const cursor = this.#parked.get(start) ?? {
			buffer: new Uint8Array(0),
			position: start,
			skip: 0,
			synced: true,
			clusterTime: null,
		};
		this.#parked.delete(start);
		return (chunk) => {
			if (this.#tracks?.size === 0) {
				return;
			}
			this.#parked.delete(cursor.position);
			this.#push(cursor, chunk);
			this.#parked.set(cursor.position, cursor);
			if (this.#parked.size > MAX_PARKED) {
				this.#parked.delete(this.#parked.keys().next().value ?? 0);
			}
		};
	}

	#push(cursor: Cursor, chunk: Uint8Array) {
		cursor.position += chunk.length;
		const dropped = Math.min(cursor.skip, chunk.length);
		cursor.skip -= dropped;
		const data = chunk.subarray(dropped);
		cursor.buffer = cursor.buffer.length ? concat(cursor.buffer, data) : data;
		while (this.#step(cursor)) {
			// each step consumes an element or resyncs
		}
		cursor.buffer = cursor.buffer.slice();
	}

	#drop(cursor: Cursor, count: number) {
		if (count <= cursor.buffer.length) {
			cursor.buffer = cursor.buffer.subarray(count);
			return;
		}
		cursor.skip = count - cursor.buffer.length;
		cursor.buffer = new Uint8Array(0);
	}

	#lose(cursor: Cursor) {
		cursor.synced = false;
		cursor.clusterTime = null;
		this.#drop(cursor, 1);
	}

	#resync(cursor: Cursor): boolean {
		let index = cursor.buffer.indexOf(0x1f);
		while (index !== -1) {
			const found = clusterAt(cursor.buffer, index);
			if (found !== false) {
				this.#drop(cursor, index);
				cursor.synced = found === true;
				return found === true;
			}
			index = cursor.buffer.indexOf(0x1f, index + 1);
		}
		this.#drop(cursor, cursor.buffer.length);
		return false;
	}

	#decide(cursor: Cursor, el: Element): "collect" | "skip" | "wait" {
		switch (el.id) {
			case INFO:
			case TRACKS:
				return el.size <= MAX_HEADER_BYTES ? "collect" : "skip";
			case TIMESTAMP:
				return el.size <= 8 ? "collect" : "skip";
			case SIMPLE_BLOCK:
			case BLOCK_GROUP: {
				if (
					el.size > MAX_BLOCK_BYTES ||
					cursor.clusterTime === null ||
					!this.#tracks
				) {
					return "skip";
				}
				const track = peekTrack(cursor.buffer, el);
				if (track === null) {
					return cursor.buffer.length < el.data + 24 ? "wait" : "skip";
				}
				return this.#tracks.has(track) ? "collect" : "skip";
			}
			default:
				return "skip";
		}
	}

	#step(cursor: Cursor): boolean {
		if (!cursor.synced) {
			return this.#resync(cursor);
		}
		const { buffer } = cursor;
		const el = element(buffer, 0);
		if (!el) {
			if (buffer.length >= 16) {
				this.#lose(cursor);
				return true;
			}
			return false;
		}
		if (el.id === SEGMENT || el.id === CLUSTER) {
			cursor.clusterTime = null;
			this.#drop(cursor, el.data);
			return true;
		}
		if (!(SKIPPED.has(el.id) || COLLECTED.has(el.id)) || el.size < 0) {
			this.#lose(cursor);
			return true;
		}
		const decision = this.#decide(cursor, el);
		const total = el.data + el.size;
		if (decision === "skip") {
			this.#drop(cursor, total);
			return true;
		}
		if (decision === "wait" || buffer.length < total) {
			return false;
		}
		this.#handle(cursor, buffer, el);
		this.#drop(cursor, total);
		return true;
	}

	#handle(cursor: Cursor, bytes: Uint8Array, el: Element) {
		if (el.id === INFO) {
			for (const field of inside(bytes, el)) {
				if (field.id === TIMESTAMP_SCALE) {
					this.#scale = uint(bytes, field);
				}
			}
		} else if (el.id === TRACKS) {
			const tracks = parseMkvTextTracks(bytes, el.data, el.data + el.size);
			this.#tracks = new Map(tracks.map((track) => [track.number, track]));
			this.#onTracks(tracks);
		} else if (el.id === TIMESTAMP) {
			cursor.clusterTime = uint(bytes, el);
		} else {
			this.#block(cursor.clusterTime ?? 0, bytes, el);
		}
	}

	#block(clusterTime: number, bytes: Uint8Array, el: Element) {
		const block =
			el.id === SIMPLE_BLOCK
				? readBlock(bytes, el.data, el.data + el.size)
				: readGroup(bytes, el);
		if (!block) {
			return;
		}
		const start = ((clusterTime + block.relative) * this.#scale) / 1e9;
		const length =
			block.duration === null
				? DEFAULT_CUE_SECONDS
				: (block.duration * this.#scale) / 1e9;
		this.#onBlock({
			track: block.track,
			start,
			end: start + length,
			data: block.data.slice(),
		});
	}
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data.slice()])
		.stream()
		.pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function blockText(
	track: MkvTextTrack,
	data: Uint8Array,
): Promise<string> {
	const { compression } = track;
	let raw = data;
	if (compression?.algorithm === 3) {
		raw = concat(compression.settings, data);
	} else if (compression) {
		raw = await inflate(data);
	}
	const decoded = utf8.decode(raw).replace(/\r/g, "");
	// A Matroska ASS event is ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text.
	return track.codec === "ass"
		? assText(decoded.split(",").slice(8).join(","))
		: decoded.trim();
}
