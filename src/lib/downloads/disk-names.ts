/**
 * Names for a download kept on disk, the way a media library names files: a
 * folder and a video called after the title (`Show S01E02.mkv`), subtitles
 * beside it as `<video>.<lang>.srt`, which mpv, VLC and IINA load on their own.
 */

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_NAME = 100;

/** `title` safe as a file name on macOS, Windows and Linux. */
export function safeFileName(title: string): string {
	const cleaned = title
		// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed
		.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_NAME)
		// Windows drops a trailing dot or space, and a leading dot hides the file.
		.replace(/^[.\s]+|[.\s]+$/g, "");
	if (!cleaned) {
		return "Download";
	}
	return RESERVED.test(cleaned) ? `${cleaned} (video)` : cleaned;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The folder and file name a download is called by: the title, and the episode. */
export function downloadName(record: {
	title: string;
	season: number | null;
	episode: number | null;
}): string {
	const episode =
		record.season !== null && record.episode !== null
			? ` S${pad(record.season)}E${pad(record.episode)}`
			: "";
	return safeFileName(`${record.title}${episode}`);
}

/** `base`, else `base (2)`, `base (3)`, … : the first one `taken` doesn't hold. */
export function uniqueName(base: string, taken: (name: string) => boolean) {
	let name = base;
	for (let copy = 2; taken(name); copy++) {
		name = `${base} (${copy})`;
	}
	return name;
}

const URL_EXTENSIONS = new Set([
	"mkv",
	"mp4",
	"m4v",
	"webm",
	"avi",
	"mov",
	"ts",
]);

/**
 * A direct file's extension: from its first bytes (what it really is), else
 * its URL, else `mkv` (players read the content, not the name).
 */
export function videoExtension(head: Uint8Array, url: string): string {
	const text = (from: number, to: number) =>
		String.fromCharCode(...head.slice(from, to));
	if (
		head[0] === 0x1a &&
		head[1] === 0x45 &&
		head[2] === 0xdf &&
		head[3] === 0xa3
	) {
		// EBML: Matroska, or WebM (its restricted profile).
		const doc = String.fromCharCode(...head).toLowerCase();
		return doc.includes("webm") ? "webm" : "mkv";
	}
	if (text(4, 8) === "ftyp") {
		return text(8, 11) === "qt " ? "mov" : "mp4";
	}
	if (text(0, 4) === "RIFF" && text(8, 12) === "AVI ") {
		return "avi";
	}
	if (head[0] === 0x47 && (head.length < 189 || head[188] === 0x47)) {
		return "ts";
	}
	let path = "";
	try {
		path = new URL(url).pathname;
	} catch {
		// no URL to go by
	}
	const extension = /\.(\w+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
	return URL_EXTENSIONS.has(extension) ? extension : "mkv";
}

/** `<base>.<lang>[.sdh].srt`, numbered when the same language comes twice. */
export function subtitleName(
	base: string,
	subtitle: { lang: string; sdh: boolean },
	taken: (name: string) => boolean,
): string {
	const lang = subtitle.lang.replace(/[^\w-]/g, "").slice(0, 20) || "und";
	const stem = `${base}.${lang}${subtitle.sdh ? ".sdh" : ""}`;
	let name = `${stem}.srt`;
	for (let copy = 2; taken(name); copy++) {
		name = `${stem}.${copy}.srt`;
	}
	return name;
}
