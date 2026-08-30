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

function streamText(stream: ResolvedStream): string {
	return [stream.name, stream.title, stream.description]
		.filter((part): part is string => Boolean(part))
		.join(" · ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Best guess at whether this stream's audio will play in the browser, from its
 * label. `risky` = a Dolby/DTS codec tag with no AAC/Opus fallback mentioned.
 */
export function audioSupport(stream: ResolvedStream): AudioSupport {
	const raw = streamText(stream);
	const risky = RISKY_AUDIO_TOKENS.some(([pattern]) => pattern.test(raw));
	if (!risky) {
		return "ok";
	}
	return SAFE_AUDIO.test(raw) ? "ok" : "risky";
}

/** Split an addon's stream label into a clean title line + short quality/feature chips. */
export function describeStream(stream: ResolvedStream): {
	title: string;
	tags: string[];
	audio: AudioSupport;
} {
	const raw = streamText(stream);

	const tags: string[] = [];
	for (const [pattern, label] of QUALITY_TOKENS) {
		if (pattern.test(raw)) {
			tags.push(label);
			break;
		}
	}
	for (const [pattern, label] of FEATURE_TOKENS) {
		if (pattern.test(raw) && !tags.includes(label)) {
			tags.push(label);
		}
	}
	for (const [pattern, label] of RISKY_AUDIO_TOKENS) {
		if (pattern.test(raw) && !tags.includes(label)) {
			tags.push(label);
			break;
		}
	}

	// First non-empty line of the label, trimmed of noise, as the title.
	const firstLine = raw.split(/[\n·]/)[0]?.trim() || stream.addonName;
	const title =
		firstLine.length > 90 ? `${firstLine.slice(0, 88)}…` : firstLine;

	return { title, tags, audio: audioSupport(stream) };
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
