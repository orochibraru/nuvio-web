/**
 * HLS for downloads: read a remote playlist, choose what to keep, and plan the
 * local copy. Pure : the worker does the fetching and the service worker does
 * the serving, both from the plan this produces.
 *
 * What a download keeps:
 *
 * - one video variant, chosen by the viewer's preferred quality;
 * - that variant's audio rendition when audio ships separately (an
 *   `#EXT-X-MEDIA:TYPE=AUDIO` group with its own playlist);
 * - every segment, the fMP4 initialisation segment (`#EXT-X-MAP`) and each
 *   AES-128 key (`#EXT-X-KEY`), a byte-range segment (`#EXT-X-BYTERANGE`) as a
 *   file of its own.
 *
 * What it refuses, with a reason the UI can show: a live stream (no
 * `#EXT-X-ENDLIST` : it never ends, so there is nothing to finish downloading),
 * and SAMPLE-AES or any key format other than plain AES-128 (DRM: the key
 * cannot be taken offline).
 */

export class HlsDownloadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HlsDownloadError";
	}
}

type Attributes = Partial<Record<string, string>>;

/** `KEY=value,KEY="quoted, value"` → a map. Keys stay upper-case as written. */
export function parseAttributes(list: string): Attributes {
	const out: Attributes = {};
	const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
	for (const match of list.matchAll(pattern)) {
		const raw = match[2];
		out[match[1]] = raw.startsWith('"') ? raw.slice(1, -1) : raw;
	}
	return out;
}

function tagValue(line: string): string {
	return line.slice(line.indexOf(":") + 1);
}

function resolveUri(uri: string, base: string): string {
	return new URL(uri, base).toString();
}

export function isHlsPlaylist(text: string): boolean {
	return text.trimStart().startsWith("#EXTM3U");
}

export function isMasterPlaylist(text: string): boolean {
	return /^#EXT-X-STREAM-INF:/m.test(text);
}

// -- Master playlists ---------------------------------------------------------

export interface Variant {
	url: string;
	bandwidth: number;
	height: number | null;
	/** Kept verbatim for the local master playlist. */
	attributes: Attributes;
	audioGroup: string | null;
}

export interface Rendition {
	type: string;
	groupId: string;
	name: string;
	language: string | null;
	isDefault: boolean;
	/** `null` when the rendition is muxed into the variant itself. */
	url: string | null;
}

export interface MasterPlaylist {
	variants: Variant[];
	renditions: Rendition[];
}

function parseVariant(
	attributes: Attributes,
	uri: string,
	baseUrl: string,
): Variant {
	const resolution = /^(\d+)x(\d+)$/.exec(attributes.RESOLUTION ?? "");
	return {
		url: resolveUri(uri, baseUrl),
		bandwidth: Number(attributes.BANDWIDTH) || 0,
		// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
		height: resolution ? Number(resolution[2]) : null,
		attributes,
		audioGroup: attributes.AUDIO ?? null,
	};
}

function parseRendition(attributes: Attributes, baseUrl: string): Rendition {
	return {
		type: attributes.TYPE ?? "",
		groupId: attributes["GROUP-ID"] ?? "",
		name: attributes.NAME ?? "",
		language: attributes.LANGUAGE ?? null,
		isDefault: attributes.DEFAULT === "YES",
		url: attributes.URI ? resolveUri(attributes.URI, baseUrl) : null,
	};
}

export function parseMasterPlaylist(
	text: string,
	baseUrl: string,
): MasterPlaylist {
	const lines = text.split(/\r?\n/).map((line) => line.trim());
	const variants: Variant[] = [];
	const renditions: Rendition[] = [];
	for (const [index, line] of lines.entries()) {
		if (line.startsWith("#EXT-X-MEDIA:")) {
			renditions.push(parseRendition(parseAttributes(tagValue(line)), baseUrl));
			continue;
		}
		if (!line.startsWith("#EXT-X-STREAM-INF:")) {
			continue;
		}
		// The variant's URI is the next line that isn't a tag.
		const uri = lines
			.slice(index + 1)
			.find((next) => next && !next.startsWith("#"));
		if (uri) {
			variants.push(
				parseVariant(parseAttributes(tagValue(line)), uri, baseUrl),
			);
		}
	}
	return { variants, renditions };
}

/** Preferred-quality setting → the tallest picture it allows. `null` = best. */
const QUALITY_HEIGHT: Record<string, number | null> = {
	auto: null,
	"4K": 2160,
	"1080p": 1080,
	"720p": 720,
	"480p": 480,
};

/**
 * The variant to keep. The tallest one within the preferred quality; when the
 * stream only offers taller ones, the shortest of those (closest to what was
 * asked for); with no preference, the tallest overall. Ties and variants with
 * no resolution fall back to bandwidth.
 */
export function chooseVariant(
	variants: readonly Variant[],
	preferredQuality = "auto",
): Variant | null {
	if (variants.length === 0) {
		return null;
	}
	const size = (variant: Variant) => variant.height ?? 0;
	const byBest = [...variants].sort(
		(a, b) => size(b) - size(a) || b.bandwidth - a.bandwidth,
	);
	const limit = QUALITY_HEIGHT[preferredQuality] ?? null;
	if (limit === null) {
		return byBest[0];
	}
	const fitting = byBest.find((variant) => size(variant) <= limit);
	return fitting ?? byBest.at(-1) ?? null;
}

/** The audio playlist a variant needs, when its audio ships separately. */
export function chooseAudio(
	master: MasterPlaylist,
	variant: Variant,
): Rendition | null {
	if (!variant.audioGroup) {
		return null;
	}
	const group = master.renditions.filter(
		(rendition) =>
			rendition.type === "AUDIO" && rendition.groupId === variant.audioGroup,
	);
	const chosen = group.find((rendition) => rendition.isDefault) ?? group[0];
	return chosen?.url ? chosen : null;
}

// -- Media playlists ----------------------------------------------------------

/** One remote resource to fetch into one local file. */
export interface PlannedFile {
	/** Local file name, relative to the playlist it belongs to. */
	name: string;
	url: string;
	/** Inclusive byte range, for `#EXT-X-BYTERANGE` / a ranged `#EXT-X-MAP`. */
	range: { start: number; end: number } | null;
}

export interface MediaPlan {
	/** The playlist to store, every URI rewritten to a local file name. */
	playlist: string;
	files: PlannedFile[];
	/** Sum of `#EXTINF`, in seconds. */
	duration: number;
}

/**
 * `length@offset`, or just `length`, which continues right after the previous
 * range of the same resource (from byte 0 for the first one).
 */
function parseByteRange(
	value: string,
	nextStart: number,
): { start: number; end: number } {
	const [length, offset] = value.split("@");
	const start = offset === undefined ? nextStart : Number(offset);
	return { start, end: start + Number(length) - 1 };
}

function extensionOf(uri: string, fallback: string): string {
	const path = uri.split(/[?#]/)[0];
	const match = /\.([a-z0-9]{2,5})$/i.exec(path);
	// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
	return match ? match[1].toLowerCase() : fallback;
}

/**
 * Plans the local copy of one media playlist: every file to fetch, and the
 * playlist rewritten to point at them. `prefix` keeps the file names of two
 * playlists (video and audio) apart in one directory.
 */
/** The running state of one planning pass. */
interface Planner {
	baseUrl: string;
	prefix: string;
	out: string[];
	files: PlannedFile[];
	segments: number;
	keys: number;
	maps: number;
	duration: number;
	pendingRange: string | null;
	nextRangeStart: number;
}

/** `#EXT-X-KEY`: plain AES-128 keys come along; DRM stops the download. */
function planKey(planner: Planner, line: string): void {
	const attributes = parseAttributes(tagValue(line));
	const method = attributes.METHOD ?? "NONE";
	if (method === "NONE") {
		planner.out.push(line);
		return;
	}
	const keyFormat = attributes.KEYFORMAT ?? "identity";
	if (method !== "AES-128" || keyFormat !== "identity") {
		throw new HlsDownloadError(
			"This stream is DRM-protected, so it can't be downloaded.",
		);
	}
	if (!attributes.URI) {
		throw new HlsDownloadError("An encryption key has no address.");
	}
	planner.keys++;
	const name = `${planner.prefix}key-${planner.keys}.bin`;
	planner.files.push({
		name,
		url: resolveUri(attributes.URI, planner.baseUrl),
		range: null,
	});
	planner.out.push(line.replace(/URI="[^"]*"/, `URI="${name}"`));
}

/** `#EXT-X-MAP`: the fMP4 initialisation segment. */
function planMap(planner: Planner, line: string): void {
	const attributes = parseAttributes(tagValue(line));
	if (!attributes.URI) {
		throw new HlsDownloadError("An initialisation segment has no address.");
	}
	planner.maps++;
	const name = `${planner.prefix}init-${planner.maps}.${extensionOf(attributes.URI, "mp4")}`;
	const range = attributes.BYTERANGE
		? parseByteRange(attributes.BYTERANGE, 0)
		: null;
	planner.files.push({
		name,
		url: resolveUri(attributes.URI, planner.baseUrl),
		range,
	});
	planner.out.push(`#EXT-X-MAP:URI="${name}"`);
}

/** A segment URI line. */
function planSegment(planner: Planner, uri: string): void {
	planner.segments++;
	const name = `${planner.prefix}seg-${String(planner.segments).padStart(5, "0")}.${extensionOf(uri, "ts")}`;
	let range: PlannedFile["range"] = null;
	if (planner.pendingRange !== null) {
		range = parseByteRange(planner.pendingRange, planner.nextRangeStart);
		planner.nextRangeStart = range.end + 1;
		planner.pendingRange = null;
	}
	planner.files.push({ name, url: resolveUri(uri, planner.baseUrl), range });
	planner.out.push(name);
}

function planLine(planner: Planner, line: string): void {
	if (line.startsWith("#EXT-X-KEY:")) {
		planKey(planner, line);
	} else if (line.startsWith("#EXT-X-MAP:")) {
		planMap(planner, line);
	} else if (line.startsWith("#EXT-X-BYTERANGE:")) {
		// Applied to the next segment, which becomes a file of its own : so
		// the tag itself is dropped from the local playlist.
		planner.pendingRange = tagValue(line);
	} else if (line.startsWith("#EXTINF:")) {
		planner.duration += Number.parseFloat(tagValue(line)) || 0;
		planner.out.push(line);
	} else if (line.startsWith("#")) {
		planner.out.push(line);
	} else {
		planSegment(planner, line);
	}
}

/**
 * Plans the local copy of one media playlist: every file to fetch, and the
 * playlist rewritten to point at them. `prefix` keeps the file names of two
 * playlists (video and audio) apart in one directory.
 */
export function planMediaPlaylist(
	text: string,
	baseUrl: string,
	prefix = "",
): MediaPlan {
	if (isMasterPlaylist(text)) {
		throw new HlsDownloadError(
			"Expected a media playlist, got a master playlist.",
		);
	}
	if (!/^#EXT-X-ENDLIST/m.test(text)) {
		throw new HlsDownloadError(
			"This is a live stream : it never ends, so it can't be downloaded.",
		);
	}
	const planner: Planner = {
		baseUrl,
		prefix,
		out: [],
		files: [],
		segments: 0,
		keys: 0,
		maps: 0,
		duration: 0,
		pendingRange: null,
		nextRangeStart: 0,
	};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line) {
			planLine(planner, line);
		}
	}
	if (planner.segments === 0) {
		throw new HlsDownloadError("The playlist lists no segments.");
	}
	return {
		playlist: `${planner.out.join("\n")}\n`,
		files: planner.files,
		duration: planner.duration,
	};
}

// -- The local master ---------------------------------------------------------

/**
 * The master playlist the local copy plays from: the one kept variant, and its
 * audio rendition when separate. Subtitle and other renditions are left out :
 * the app takes its subtitles from addons, not from the stream.
 */
export function localMasterPlaylist(
	variant: Variant,
	videoPlaylist: string,
	audio: { rendition: Rendition; playlist: string } | null,
): string {
	const lines = ["#EXTM3U"];
	const {
		SUBTITLES: _subtitles,
		"CLOSED-CAPTIONS": _captions,
		AUDIO: _audio,
		...attributes
	} = variant.attributes;
	if (audio) {
		const { rendition } = audio;
		const parts = [
			"TYPE=AUDIO",
			'GROUP-ID="audio"',
			`NAME="${rendition.name || "Audio"}"`,
			rendition.language ? `LANGUAGE="${rendition.language}"` : null,
			"DEFAULT=YES",
			"AUTOSELECT=YES",
			`URI="${audio.playlist}"`,
		].filter(Boolean);
		lines.push(`#EXT-X-MEDIA:${parts.join(",")}`);
		attributes.AUDIO = "audio";
	}
	const quoted = new Set(["CODECS", "AUDIO", "VIDEO"]);
	const list = Object.entries(attributes)
		.filter((entry): entry is [string, string] => entry[1] !== undefined)
		.map(([key, value]) =>
			quoted.has(key) ? `${key}="${value}"` : `${key}=${value}`,
		)
		.join(",");
	lines.push(`#EXT-X-STREAM-INF:${list}`, videoPlaylist);
	return `${lines.join("\n")}\n`;
}
