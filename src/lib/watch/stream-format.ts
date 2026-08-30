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
