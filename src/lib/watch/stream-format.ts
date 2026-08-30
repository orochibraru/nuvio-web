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
	[/\batmos\b/i, "Atmos"],
	[/\b(x265|hevc|h\.?265)\b/i, "HEVC"],
	[/\b(av1)\b/i, "AV1"],
	[/\b(remux)\b/i, "REMUX"],
	[/\b(bluray|blu-ray|bdrip)\b/i, "BluRay"],
	[/\b(web-?dl|webrip)\b/i, "WEB"],
];

/** Split an addon's stream label into a clean title line + short quality/feature chips. */
export function describeStream(stream: ResolvedStream): {
	title: string;
	tags: string[];
} {
	const raw = [stream.name, stream.title, stream.description]
		.filter((part): part is string => Boolean(part))
		.join(" · ")
		.replace(/\s+/g, " ")
		.trim();

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

	// First non-empty line of the label, trimmed of noise, as the title.
	const firstLine = raw.split(/[\n·]/)[0]?.trim() || stream.addonName;
	const title =
		firstLine.length > 90 ? `${firstLine.slice(0, 88)}…` : firstLine;

	return { title, tags };
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

/**
 * Pick the best playable stream for a preferred quality. `"auto"` (or an
 * unknown value) keeps the addon's own ordering. Otherwise: an exact match, else
 * the highest quality at or below the target, else the lowest above it, else the
 * first playable stream. Never returns a non-playable stream unless nothing is
 * playable at all.
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
		return playable[0];
	}

	let atOrBelow: { stream: ResolvedStream; rank: number } | null = null;
	let above: { stream: ResolvedStream; rank: number } | null = null;
	for (const stream of playable) {
		const quality = streamQuality(stream);
		const rank = quality !== null ? QUALITY_RANK[quality] : -1;
		if (rank === target) {
			return stream;
		}
		if (rank >= 0 && rank < target) {
			if (atOrBelow === null || rank > atOrBelow.rank) {
				atOrBelow = { stream, rank };
			}
		} else if (rank > target) {
			if (above === null || rank < above.rank) {
				above = { stream, rank };
			}
		}
	}
	return (atOrBelow ?? above)?.stream ?? playable[0];
}
