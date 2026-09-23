/**
 * A download, as the app lists it. The bytes live in the Origin Private File
 * System (see `files.ts`); this record is what the Downloads page, the player
 * and the offline page read, kept in IndexedDB (see `store.ts`).
 */

export type DownloadStatus =
	| "queued"
	| "downloading"
	| "paused"
	| "done"
	| "error";

/**
 * Why a download failed. A code, not text: the worker has no locale, so the
 * page words it (see `failure.ts`). `http:<status>`; `storage:<needed>:<free>`
 * in bytes; `failed` for anything unexpected.
 */
export type DownloadFailure =
	| "drm"
	| "live"
	| "playlist"
	| "no-data"
	| "failed"
	| `http:${number}`
	| `storage:${number}:${number}`;

/** `file` : one direct media file. `hls` : a playlist and its segments. */
export type DownloadKind = "file" | "hls";

export interface DownloadedSubtitle {
	lang: string;
	sdh: boolean;
	/** Local file name under the download's `subs/` directory. */
	file: string;
}

export interface DownloadRecord {
	id: string;
	/** `syncOwner(userId, profileId)` : downloads are listed per profile. */
	owner: string;

	type: "movie" | "series";
	contentId: string;
	videoId: string;
	season: number | null;
	episode: number | null;
	title: string;
	subtitle: string | null;
	poster: string | null;
	background: string | null;

	sourceUrl: string;
	sourceLabel: string;
	addonName: string;
	/** The preferred quality at the time, for choosing an HLS variant. */
	quality: string;

	/** Known once the source has been probed. */
	kind: DownloadKind | null;
	/** The local file playback starts from (`media` or `index.m3u8`). */
	entry: string | null;
	mimeType: string | null;

	status: DownloadStatus;
	/** A `DownloadFailure` code (older records may hold English text). */
	error: string | null;
	bytes: number;
	/** Known for a direct file with a length; unknown for HLS. */
	totalBytes: number | null;
	filesDone: number;
	filesTotal: number | null;
	subtitles: DownloadedSubtitle[];

	createdAt: number;
	completedAt: number | null;
}

/** What the page supplies to start one. */
export type NewDownload = Pick<
	DownloadRecord,
	| "type"
	| "contentId"
	| "videoId"
	| "season"
	| "episode"
	| "title"
	| "subtitle"
	| "poster"
	| "background"
	| "sourceUrl"
	| "sourceLabel"
	| "addonName"
	| "quality"
> & {
	/** Addon subtitles to take along, fetched by the worker like the rest. */
	subtitleSources: Array<{ lang: string; sdh: boolean; url: string }>;
};

/** Page → worker. */
export type WorkerCommand =
	| {
			type: "start";
			record: DownloadRecord;
			subtitleSources: NewDownload["subtitleSources"];
	  }
	| { type: "abort"; id: string };

/** Worker → page. */
export type WorkerEvent =
	| { type: "progress"; id: string; patch: Partial<DownloadRecord> }
	| { type: "done"; id: string; patch: Partial<DownloadRecord> }
	| { type: "failed"; id: string; error: DownloadFailure }
	| { type: "aborted"; id: string };
