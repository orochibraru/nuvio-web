/** One resolved stream option, as returned by the `resolveStreams` remote query. */
export interface ResolvedStream {
	index: number;
	url: string | null;
	externalUrl: string | null;
	notWebReady: boolean;
	name: string | null;
	title: string | null;
	description: string | null;
	addonName: string;
	fileSize: number | null;
	/** Torrent info hash, when the addon returned a P2P stream. */
	infoHash: string | null;
	/** `behaviorHints.filename` — the exact release file name, when the addon sends it. */
	filename: string | null;
}

export type StreamKind = "direct" | "p2p";

/**
 * `p2p` when the addon handed back a torrent (an `infoHash`, a `magnet:` url, or
 * a `notWebReady` link with no http url) — these stream over BitTorrent and
 * can't play directly in the browser. `direct` otherwise (an http(s) url,
 * including debrid-resolved torrents).
 */
export function streamKind(stream: ResolvedStream): StreamKind {
	if (stream.infoHash) {
		return "p2p";
	}
	if (stream.url?.startsWith("magnet:")) {
		return "p2p";
	}
	if (!stream.url && stream.notWebReady && !stream.externalUrl) {
		return "p2p";
	}
	return "direct";
}

const QUALITY_TOKENS: Array<[RegExp, string]> = [
	[/\b(2160p|4k|uhd)\b/i, "4K"],
	[/\b1440p\b/i, "1440p"],
	[/\b1080p\b/i, "1080p"],
	[/\b720p\b/i, "720p"],
	[/\b480p\b/i, "480p"],
	[/\b360p\b/i, "360p"],
];

const FEATURE_TOKENS: Array<[RegExp, string]> = [
	[/\bdolby\s?vision\b|\bdv\b/i, "DV"],
	[/\bhdr10\+?\b|\bhdr\b/i, "HDR"],
	[/\b(x265|hevc|h\.?265)\b/i, "HEVC"],
	[/\b(av1)\b/i, "AV1"],
	[/\b(remux)\b/i, "REMUX"],
	[/\b(bluray|blu-ray|bdrip)\b/i, "BluRay"],
	[/\b(web-?dl|webrip)\b/i, "WEB"],
];

const SOURCE_TOKENS: Array<[RegExp, string]> = [
	[/\bremux\b/i, "REMUX"],
	[/\b(blu-?ray|bdrip|bd-?remux)\b/i, "BluRay"],
	[/\bweb-?dl\b/i, "WEB-DL"],
	[/\bweb-?rip\b/i, "WEBRip"],
	[/\bhdtv\b/i, "HDTV"],
	[/\b(dvdrip|dvd-?r)\b/i, "DVD"],
	[/\b(cam|hdcam|ts|telesync)\b/i, "CAM"],
];

const VIDEO_CODEC_TOKENS: Array<[RegExp, string]> = [
	[/\b(av1)\b/i, "AV1"],
	[/\b(x265|hevc|h\.?265)\b/i, "HEVC"],
	[/\b(x264|avc|h\.?264)\b/i, "H.264"],
	[/\b(xvid|divx|mpeg-?4)\b/i, "MPEG-4"],
];

// Human audio-codec label, best → simplest match wins.
const AUDIO_CODEC_TOKENS: Array<[RegExp, string]> = [
	[/\batmos\b/i, "Atmos"],
	[/\b(true-?hd)\b/i, "TrueHD"],
	[/\b(dts-?hd|dts\s?ma|dts-?x)\b/i, "DTS-HD"],
	[/\bdts\b/i, "DTS"],
	[/\b(e-?ac-?3|eac3|dd\s?\+|ddp\d?\.?\d?|dolby\s?digital\s?plus)\b/i, "DD+"],
	[/\b(ac-?3|dd\s?[0-9]\.[0-9]|dolby\s?digital)\b/i, "DD"],
	[/\bflac\b/i, "FLAC"],
	[/\b(opus)\b/i, "Opus"],
	[/\b(aac|he-?aac|lc-?aac)\b/i, "AAC"],
	[/\b(mp3)\b/i, "MP3"],
	[/\b(pcm|lpcm)\b/i, "PCM"],
];

// Audio codecs a browser `<video>` element usually can't decode — a stream
// tagged with one of these tends to play with no sound in the browser. Chrome's
// support for AC-3 / E-AC-3 is platform- and build-dependent, so this is a
// "likely" signal, not a guarantee.
const RISKY_AUDIO_TOKENS: Array<[RegExp, string]> = [
	[/\b(atmos)\b/i, "Atmos"],
	[/\b(e-?ac-?3|eac3|dd\s?\+|ddp\d?\.?\d?|dolby\s?digital\s?plus)\b/i, "EAC3"],
	[/\b(ac-?3|dd\s?5\.1|dd\s?2\.0|dolby\s?digital)\b/i, "AC3"],
	[/\b(dts-?hd|dts-?x|dts\s?ma|dts)\b/i, "DTS"],
	[/\b(true-?hd|mlp)\b/i, "TrueHD"],
];
// A positive signal that overrides the risky check.
const SAFE_AUDIO = /\b(aac|opus|mp3|vorbis|e-ac-3 to aac|→\s?aac|to aac)\b/i;

export type AudioSupport = "ok" | "risky";

/** Everything from the addon's stream label + `behaviorHints`, structured. */
export interface StreamMeta {
	/** Clean, human title for the row (release name, else the label's first line). */
	title: string;
	/** The exact file name when the addon provides one. */
	filename: string | null;
	quality: string | null;
	source: string | null;
	videoCodec: string | null;
	audioCodec: string | null;
	hdr: string | null;
	tenBit: boolean;
	/** Seeder count parsed from the label (`👤 N`) — P2P only. */
	seeders: number | null;
	/** Human size — `behaviorHints.videoSize`, else parsed from the label. */
	size: string | null;
	/** Flag emojis + text markers (MULTI / Dual) found in the label. */
	languages: string[];
	audio: AudioSupport;
	/** Short quality/feature chips, kept for back-compat with older callers. */
	tags: string[];
}

/** All label text with line structure preserved, for line-oriented parsing. */
function rawLabel(stream: ResolvedStream): string {
	return [stream.name, stream.title, stream.description]
		.filter((part): part is string => Boolean(part))
		.join("\n");
}

/**
 * All label text collapsed to one line, for token matching. The
 * `behaviorHints.filename` is folded in — release tags (codec, source, HDR)
 * often live only in the file name, not the human label.
 */
function flatLabel(stream: ResolvedStream): string {
	return [rawLabel(stream), stream.filename ?? ""]
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function firstMatch(
	text: string,
	tokens: Array<[RegExp, string]>,
): string | null {
	for (const [pattern, label] of tokens) {
		if (pattern.test(text)) {
			return label;
		}
	}
	return null;
}

/**
 * Best guess at whether this stream's audio will play in the browser, from its
 * label. `risky` = a Dolby/DTS codec tag with no AAC/Opus fallback mentioned.
 */
export function audioSupport(stream: ResolvedStream): AudioSupport {
	const raw = flatLabel(stream);
	const risky = RISKY_AUDIO_TOKENS.some(([pattern]) => pattern.test(raw));
	if (!risky) {
		return "ok";
	}
	return SAFE_AUDIO.test(raw) ? "ok" : "risky";
}

/** Regional-indicator flag emojis (as-is) found in the text. */
function flagEmojis(text: string): string[] {
	const out =
		text.match(/\p{Regional_Indicator}\p{Regional_Indicator}/gu) ?? [];
	return [...new Set(out)];
}

function parseSize(stream: ResolvedStream, flat: string): string | null {
	if (stream.fileSize && stream.fileSize > 0) {
		return formatFileSize(stream.fileSize);
	}
	const match = flat.match(/(\d+(?:\.\d+)?)\s?(TB|GB|MB|KB)\b/i);
	return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}

function parseSeeders(flat: string): number | null {
	const match = flat.match(/(?:👤|seeders?[:\s]|👥)\s*(\d[\d,]*)/i);
	return match ? Number(match[1].replace(/,/g, "")) : null;
}

/**
 * A clean release name: the file name (minus extension, dots → spaces) when the
 * addon gives one, else the first line of the label, else the addon name.
 */
function releaseTitle(stream: ResolvedStream, raw: string): string {
	const candidate =
		stream.filename ??
		raw
			.split("\n")
			.map((line) => line.trim())
			.find(
				(line) =>
					line && !/^[^\p{L}\p{N}]+$/u.test(line) && !/^👤|^💾/.test(line),
			);
	if (!candidate) {
		return stream.addonName;
	}
	const cleaned = candidate
		.replace(/\.(mkv|mp4|avi|m4v|ts|webm)$/i, "")
		.replace(/[._]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.length > 90 ? `${cleaned.slice(0, 88)}…` : cleaned;
}

/** Parse an addon's stream label + `behaviorHints` into structured metadata. */
export function streamMeta(stream: ResolvedStream): StreamMeta {
	const raw = rawLabel(stream);
	const flat = flatLabel(stream);

	const quality = firstMatch(flat, QUALITY_TOKENS);
	const source = firstMatch(flat, SOURCE_TOKENS);
	const videoCodec = firstMatch(flat, VIDEO_CODEC_TOKENS);
	const audioCodec = firstMatch(flat, AUDIO_CODEC_TOKENS);
	const hdr = /\bdolby\s?vision\b|\bdv\b/i.test(flat)
		? "DV"
		: /\bhdr10\+\b/i.test(flat)
			? "HDR10+"
			: /\bhdr\b/i.test(flat)
				? "HDR"
				: null;

	const languages = [
		...flagEmojis(raw),
		...(/\bmulti(?:-?(?:audio|sub))?\b/i.test(flat) ? ["MULTI"] : []),
		...(/\bdual[\s-]?audio\b/i.test(flat) ? ["Dual"] : []),
	];

	// Back-compat chip list.
	const tags: string[] = [];
	if (quality) {
		tags.push(quality);
	}
	for (const [pattern, label] of FEATURE_TOKENS) {
		if (pattern.test(flat) && !tags.includes(label)) {
			tags.push(label);
		}
	}

	return {
		title: releaseTitle(stream, raw),
		filename: stream.filename,
		quality,
		source,
		videoCodec,
		audioCodec,
		hdr,
		tenBit: /\b10[\s-]?bit\b/i.test(flat),
		seeders: parseSeeders(flat),
		size: parseSize(stream, flat),
		languages,
		audio: audioSupport(stream),
		tags,
	};
}

/** @deprecated use {@link streamMeta}. Kept for callers that only need the label. */
export function describeStream(stream: ResolvedStream): StreamMeta {
	return streamMeta(stream);
}

export function formatFileSize(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) {
		return null;
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 100 || unit < 2 ? 0 : 1)} ${units[unit]}`;
}

export function isPlayable(stream: ResolvedStream): boolean {
	return Boolean(stream.url) && !stream.notWebReady;
}

/** Ordered best-to-worst; also the values the player-quality setting offers. */
export const QUALITY_RANK: Record<string, number> = {
	"4K": 5,
	"1440p": 4,
	"1080p": 3,
	"720p": 2,
	"480p": 1,
	"360p": 0,
};

/** The resolution tag carried by a stream's label, or null when it has none. */
export function streamQuality(stream: ResolvedStream): string | null {
	const raw = [stream.name, stream.title, stream.description]
		.filter((part): part is string => Boolean(part))
		.join(" ");
	for (const [pattern, label] of QUALITY_TOKENS) {
		if (pattern.test(raw)) {
			return label;
		}
	}
	return null;
}

/** How close a stream's quality is to the target (0 = exact, higher = worse). */
function qualityDistance(stream: ResolvedStream, target: number): number {
	const quality = streamQuality(stream);
	const rank = quality !== null ? QUALITY_RANK[quality] : -1;
	if (rank < 0) {
		// Unknown quality: treat as one step worse than an exact match.
		return 1;
	}
	// Prefer at-or-below the target over above it (bandwidth), so penalise
	// higher-than-target more.
	return rank <= target ? target - rank : (rank - target) * 2;
}

/**
 * Pick the best playable stream for a preferred quality, preferring one whose
 * audio should decode in the browser. `"auto"` (or an unknown value) keeps the
 * addon's own ordering but still hops over a leading run of likely-silent
 * streams when a browser-friendly one exists. Never returns a non-playable
 * stream unless nothing is playable at all.
 */
export function pickPreferredStream(
	streams: ResolvedStream[],
	preferred: string,
): ResolvedStream | null {
	const playable = streams.filter(isPlayable);
	if (playable.length === 0) {
		return streams[0] ?? null;
	}

	const target = QUALITY_RANK[preferred];

	if (target === undefined) {
		// "auto": keep addon order, but skip past streams whose audio looks
		// unplayable if a safe one is available.
		return (
			playable.find((stream) => audioSupport(stream) === "ok") ?? playable[0]
		);
	}

	// Rank by quality closeness first, then by audio safety, then by input order.
	const scored = playable.map((stream, order) => ({
		stream,
		order,
		distance: qualityDistance(stream, target),
		audioPenalty: audioSupport(stream) === "ok" ? 0 : 1,
	}));
	scored.sort(
		(a, b) =>
			a.distance - b.distance ||
			a.audioPenalty - b.audioPenalty ||
			a.order - b.order,
	);
	return scored[0]?.stream ?? playable[0];
}
