/**
 * Where a download's bytes live, and the URL the app plays them from. Shared by
 * the page, the download worker and the service worker, so the three cannot
 * disagree about a path.
 *
 * Layout, in the Origin Private File System:
 *
 *     downloads/<id>/plan.json      what to fetch, and what is fetched
 *     downloads/<id>/media          a direct file
 *     downloads/<id>/index.m3u8     an HLS copy's master playlist
 *     downloads/<id>/video.m3u8     … its media playlist, and segments
 *     downloads/<id>/subs/<n>.srt   subtitles taken along
 *
 * The service worker answers `/offline-media/<id>/<path>` from that tree, so a
 * downloaded title plays through a same-origin URL, with range requests, in
 * the ordinary `<video>` / hls.js path the player already has.
 */

export const DOWNLOADS_DIR = "downloads";
export const PLAN_FILE = "plan.json";
export const LOCAL_MEDIA_PREFIX = "/offline-media/";

/** Download ids are UUIDs; anything else never reaches the file system. */
const ID = /^[0-9a-f-]{36}$/;
/** One or two segments of safe characters: `media`, `subs/1.srt`. */
const PATH = /^[\w.-]+(\/[\w.-]+)?$/;

export function localMediaUrl(id: string, path: string): string {
	return `${LOCAL_MEDIA_PREFIX}${id}/${path}`;
}

/** `/offline-media/<id>/<path>` → its parts, or `null` for anything else. */
export function parseLocalMediaPath(
	pathname: string,
): { id: string; path: string } | null {
	if (!pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
		return null;
	}
	const rest = pathname.slice(LOCAL_MEDIA_PREFIX.length);
	const slash = rest.indexOf("/");
	if (slash < 0) {
		return null;
	}
	const id = rest.slice(0, slash);
	const path = decodeURIComponent(rest.slice(slash + 1));
	if (!(ID.test(id) && PATH.test(path)) || path.split("/").includes("..")) {
		return null;
	}
	return { id, path };
}

const TYPES: Record<string, string> = {
	m3u8: "application/vnd.apple.mpegurl",
	ts: "video/mp2t",
	m4s: "video/iso.segment",
	mp4: "video/mp4",
	m4a: "audio/mp4",
	aac: "audio/aac",
	vtt: "text/vtt",
	srt: "text/plain; charset=utf-8",
	bin: "application/octet-stream",
	webm: "video/webm",
	mkv: "video/x-matroska",
};

/** The content type to serve a local file with. `media` uses the recorded one. */
export function contentTypeFor(path: string, mediaType: string | null): string {
	if (path === "media") {
		return mediaType ?? "video/mp4";
	}
	const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
	return TYPES[extension] ?? "application/octet-stream";
}

/**
 * A `Range: bytes=…` header against a file of `size` bytes → the inclusive
 * range to serve, `null` for the whole file, or `"unsatisfiable"`.
 */
export function parseRange(
	header: string | null,
	size: number,
): { start: number; end: number } | null | "unsatisfiable" {
	if (!header) {
		return null;
	}
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
	if (!match || (match[1] === "" && match[2] === "")) {
		return null;
	}
	let start: number;
	let end: number;
	if (match[1] === "") {
		// A suffix range: the last N bytes.
		const length = Number(match[2]);
		start = Math.max(0, size - length);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start >= size || start > end) {
		return "unsatisfiable";
	}
	return { start, end };
}

/** The same-origin pass-through for sources the browser can't fetch itself. */
export function proxiedUrl(url: string): string {
	return `/api/downloads/proxy?url=${encodeURIComponent(url)}`;
}
