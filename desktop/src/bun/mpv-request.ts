import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { safeRequestHeaders } from "../../../src/lib/core/request-headers.ts";

export interface MpvRequest {
	url: string;
	title: string;
	start: number;
	/** `Name: value` fields the stream's host wants (the addon's `proxyHeaders`). */
	headerFields: string[];
	/** Addon subtitle URLs, loaded beside the video. */
	subtitles: string[];
}

// mpv fetches every subtitle before it starts playing.
const MAX_SUBTITLES = 10;

/** `nuvio-download:<id>`: a download in the app's folder, by id. */
const DOWNLOAD = /^nuvio-download:([0-9a-f-]{36})$/;

function httpUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

/**
 * The video of download `id`: the folder whose hidden record (written by the
 * server, see `local-downloads.ts`) has that id, and the file it names, which
 * must be a plain name inside that folder.
 */
function downloadedVideo(downloads: string, id: string): string | null {
	let folders: string[];
	try {
		folders = readdirSync(downloads);
	} catch {
		return null;
	}
	for (const folder of folders) {
		try {
			const record = JSON.parse(
				readFileSync(join(downloads, folder, ".nuvio.json"), "utf8"),
			) as { id?: unknown; entry?: unknown; status?: unknown };
			const entry = record.entry;
			if (
				record.id === id &&
				record.status === "done" &&
				typeof entry === "string" &&
				entry === basename(entry) &&
				!entry.startsWith(".")
			) {
				return join(downloads, folder, entry);
			}
		} catch {
			// Not a download's folder.
		}
	}
	return null;
}

/**
 * What the page asked for, if it is sane: an http(s) URL, or a finished
 * download named by its id (resolved here, so the page never names a path on
 * this computer), a short title, a start in range, well-formed headers and
 * http(s) subtitles.
 */
export function parseMpvRequest(
	value: unknown,
	downloads: string,
): MpvRequest | null {
	const request = value as {
		url?: unknown;
		title?: unknown;
		start?: unknown;
		headers?: unknown;
		subtitles?: unknown;
	} | null;
	if (!(request && typeof request.url === "string")) {
		return null;
	}
	const download = DOWNLOAD.exec(request.url);
	const target = download
		? downloadedVideo(downloads, download[1])
		: httpUrl(request.url);
	if (!target) {
		return null;
	}
	const start = Number(request.start);
	const headers = download ? undefined : safeRequestHeaders(request.headers);
	const subtitles = Array.isArray(request.subtitles)
		? request.subtitles.map(httpUrl).filter((url) => url !== null)
		: [];
	return {
		url: target,
		title: String(request.title ?? "").slice(0, 300),
		start: Number.isFinite(start) && start > 0 ? start : 0,
		headerFields: Object.entries(headers ?? {}).map(
			([name, field]) => `${name}: ${field}`,
		),
		subtitles: [...new Set(subtitles)].slice(0, MAX_SUBTITLES),
	};
}

/**
 * mpv's command line for `request`. Each header and subtitle is its own
 * `-append` item, which mpv never splits on commas, so a value holding one
 * (a `Referer` with a query, a cookie) arrives whole.
 */
export function mpvArguments(
	binary: string,
	request: MpvRequest,
	ipc: string,
): string[] {
	return [
		binary,
		"--hwdec=auto-safe",
		"--force-window=immediate",
		"--keep-open=no",
		"--idle=no",
		"--ytdl=no",
		"--save-position-on-quit=no",
		"--msg-level=all=warn",
		`--start=${request.start}`,
		`--force-media-title=${request.title}`,
		`--input-ipc-server=${ipc}`,
		...request.headerFields.map(
			(field) => `--http-header-fields-append=${field}`,
		),
		...request.subtitles.map((url) => `--sub-files-append=${url}`),
		"--",
		request.url,
	];
}
