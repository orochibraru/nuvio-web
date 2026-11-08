import { eachUntilFailure } from "./fan-out.ts";
import { PLAN_FILE } from "./files.ts";
import {
	chooseAudio,
	chooseVariant,
	DownloadError,
	isHlsPlaylist,
	isMasterPlaylist,
	localMasterPlaylist,
	type PlannedFile,
	parseMasterPlaylist,
	planMediaPlaylist,
} from "./hls.ts";
import type {
	DownloadedSubtitle,
	DownloadFailure,
	DownloadRecord,
	NewDownload,
	WorkerEvent,
} from "./types.ts";

/**
 * One download, start to finish, against whatever holds the bytes: the
 * browser's private file system (the download worker) or a folder on disk
 * (the desktop app's server, see `local-downloads.ts`).
 *
 * Resumable either way: a direct file continues with a `Range` request from
 * the bytes already on disk, and an HLS copy records each finished file in
 * `plan.json` and skips it next time.
 */

/** Paths are relative to the download's own directory: `media`, `subs/1.srt`. */
export interface Disk {
	readText: (path: string) => Promise<string | null>;
	/** 0 when the file isn't there. */
	size: (path: string) => Promise<number>;
	/** Replaces the file; returns the bytes written. */
	writeWhole: (path: string, data: Uint8Array | string) => Promise<number>;
	open: (path: string) => Promise<Writer>;
	/** Throws a `storage:` `DownloadError` when `bytes` won't fit. */
	ensureRoom: (bytes: number) => Promise<void>;
}

export interface Writer {
	write: (data: Uint8Array, at: number) => void | Promise<void>;
	truncate: (size: number) => void | Promise<void>;
	close: () => void | Promise<void>;
}

/**
 * Fetches `url`, rejecting with `Aborted` once `signal` is. `plan` is the
 * browser's: it records that the source needed the same-origin pass-through.
 */
export type SourceFetch = (
	url: string,
	plan: Pick<Plan, "viaProxy">,
	signal: AbortSignal,
	range?: { start: number; end: number | null } | null,
) => Promise<Response>;

/** Segments are small and many; a few at a time keeps a CDN happy. */
const SEGMENT_CONCURRENCY = 3;
const PROGRESS_INTERVAL_MS = 250;

export interface Plan {
	kind: "file" | "hls";
	entry: string;
	mimeType: string | null;
	/** HLS only : every file to fetch, playlists excluded (written up front). */
	files: PlannedFile[];
	done: string[];
	/** The source needed the same-origin pass-through; keep using it. */
	viaProxy: boolean;
	subtitles: DownloadedSubtitle[];
	totalBytes: number | null;
}

export class Aborted extends Error {}

/** What a download that threw failed with: a code the page words. */
export function failureOf(error: unknown): DownloadFailure {
	return error instanceof DownloadError ? error.code : "failed";
}

/** A free-space check against `free` bytes, for a `Disk`. */
export function checkRoom(bytesNeeded: number, free: number): void {
	if (bytesNeeded > free) {
		const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
		throw new DownloadError(
			`Not enough storage: this needs ${gb(bytesNeeded)}, ${gb(free)} is free.`,
			`storage:${bytesNeeded}:${free}`,
		);
	}
}

function checkedResponse(response: Response, what: string): Response {
	if (response.ok || response.status === 416) {
		return response;
	}
	throw new DownloadError(
		`${what} answered ${response.status}.`,
		`http:${response.status}`,
	);
}

async function loadPlan(disk: Disk): Promise<Plan | null> {
	const text = await disk.readText(PLAN_FILE);
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text) as Plan;
	} catch {
		return null;
	}
}

/**
 * Writes `plan.json`. Serialised: several segment downloads finish at once and
 * each marks itself done.
 */
function planWriter(disk: Disk, plan: Plan) {
	let chain = Promise.resolve();
	return () => {
		chain = chain.then(async () => {
			await disk.writeWhole(PLAN_FILE, JSON.stringify(plan));
		});
		return chain;
	};
}

function looksLikeHls(url: string, contentType: string | null): boolean {
	return (
		/\.m3u8($|[?#])/i.test(new URL(url).pathname) ||
		/mpegurl/i.test(contentType ?? "")
	);
}

/** One download in progress : what every step below works against. */
interface Job {
	record: DownloadRecord;
	disk: Disk;
	fetchSource: SourceFetch;
	plan: Plan;
	signal: AbortSignal;
	progress: (patch: Partial<DownloadRecord>) => void;
}

async function fetchText(job: Job, url: string, what: string): Promise<string> {
	const response = await job.fetchSource(url, job.plan, job.signal);
	return checkedResponse(response, what).text();
}

/**
 * Probes the source with a one-byte range. A playlist comes back as its text;
 * anything else is a direct file, and its size and type go on the plan.
 */
async function sniffPlaylist(job: Job): Promise<string | null> {
	const { record, plan, signal } = job;
	const probe = checkedResponse(
		await job.fetchSource(record.sourceUrl, plan, signal, {
			start: 0,
			end: 0,
		}),
		"The source",
	);
	const contentType = probe.headers.get("content-type");
	// Only the first chunk is read, then the rest dropped: a server that ignores
	// `Range` would otherwise send a whole film just to be sniffed.
	const reader = probe.body?.getReader();
	const first = reader ? (await reader.read()).value : undefined;
	await reader?.cancel().catch(() => undefined);
	const head = new TextDecoder().decode(
		(first ?? new Uint8Array()).slice(0, 7),
	);
	if (looksLikeHls(record.sourceUrl, contentType) || head === "#EXTM3U") {
		return fetchText(job, record.sourceUrl, "The playlist");
	}
	// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
	const total = /\/(\d+)$/.exec(probe.headers.get("content-range") ?? "")?.[1];
	plan.totalBytes = total ? Number(total) : null;
	plan.mimeType = contentType?.split(";")[0] ?? null;
	return null;
}

/** Plans one media playlist into `<name>` and queues its files. */
async function planPlaylist(
	job: Job,
	source: { url: string; text: string },
	local: { name: string; prefix: string },
): Promise<void> {
	const media = planMediaPlaylist(source.text, source.url, local.prefix);
	await job.disk.writeWhole(local.name, media.playlist);
	job.plan.files.push(...media.files);
}

/** A master playlist: one variant, its separate audio, and a local master. */
async function planMaster(job: Job, playlist: string): Promise<void> {
	const master = parseMasterPlaylist(playlist, job.record.sourceUrl);
	const variant = chooseVariant(master.variants, job.record.quality);
	if (!variant) {
		throw new DownloadError("The playlist lists no video.");
	}
	await planPlaylist(
		job,
		{
			url: variant.url,
			text: await fetchText(job, variant.url, "The video playlist"),
		},
		{ name: "video.m3u8", prefix: "video-" },
	);
	const rendition = chooseAudio(master, variant);
	let audio: Parameters<typeof localMasterPlaylist>[2] = null;
	if (rendition?.url) {
		await planPlaylist(
			job,
			{
				url: rendition.url,
				text: await fetchText(job, rendition.url, "The audio playlist"),
			},
			{ name: "audio.m3u8", prefix: "audio-" },
		);
		audio = { rendition, playlist: "audio.m3u8" };
	}
	await job.disk.writeWhole(
		"index.m3u8",
		localMasterPlaylist(variant, "video.m3u8", audio),
	);
}

/** Decides what the source is and writes the plan (and any playlists) for it. */
async function planDownload(job: Job): Promise<void> {
	const playlist = await sniffPlaylist(job);
	if (playlist === null) {
		return;
	}
	if (!isHlsPlaylist(playlist)) {
		throw new DownloadError("The source is not a playlist.");
	}
	const { plan } = job;
	plan.kind = "hls";
	plan.entry = "index.m3u8";
	plan.mimeType = "application/vnd.apple.mpegurl";
	if (isMasterPlaylist(playlist)) {
		await planMaster(job, playlist);
	} else {
		await planPlaylist(
			job,
			{ url: job.record.sourceUrl, text: playlist },
			{ name: "index.m3u8", prefix: "video-" },
		);
	}
}

async function fetchSubtitles(
	job: Job,
	sources: NewDownload["subtitleSources"],
): Promise<DownloadedSubtitle[]> {
	const kept: DownloadedSubtitle[] = [];
	for (const [index, source] of sources.entries()) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: a handful of small files, one after another, is kinder to a subtitle host than a burst
			const response = await job.fetchSource(
				source.url,
				{ viaProxy: job.plan.viaProxy },
				job.signal,
			);
			if (!response.ok) {
				continue;
			}
			const file = `${index + 1}.srt`;
			await job.disk.writeWhole(`subs/${file}`, await response.text());
			kept.push({ lang: source.lang, sdh: source.sdh, file });
		} catch (error) {
			if (error instanceof Aborted) {
				throw error;
			}
			// A missing subtitle is not worth failing the download for.
		}
	}
	return kept;
}

async function downloadFile(job: Job): Promise<number> {
	const { record, disk, plan, signal, progress } = job;
	let written = await disk.size("media");
	if (plan.totalBytes !== null && written >= plan.totalBytes) {
		return written;
	}
	if (plan.totalBytes !== null) {
		await disk.ensureRoom(plan.totalBytes - written);
	}
	const response = checkedResponse(
		await job.fetchSource(record.sourceUrl, plan, signal, {
			start: written,
			end: null,
		}),
		"The source",
	);
	if (response.status === 416) {
		return written;
	}
	const writer = await disk.open("media");
	try {
		const length = Number(response.headers.get("content-length"));
		if (response.status !== 206) {
			// The server ignored the range and sent the whole file: start over.
			written = 0;
			await writer.truncate(0);
			if (length > 0) {
				plan.totalBytes = length;
				await disk.ensureRoom(length);
			}
		} else if (plan.totalBytes === null && length > 0) {
			// The probe couldn't read `Content-Range` (not CORS-exposed by
			// default), but `Content-Length` always is : it's what's left.
			plan.totalBytes = written + length;
			await disk.ensureRoom(length);
		}
		const reader = response.body?.getReader();
		if (!reader) {
			throw new DownloadError("The source sent no data.", "no-data");
		}
		for (;;) {
			// biome-ignore lint/performance/noAwaitInLoops: reading a stream is sequential by nature
			const { done, value } = await reader.read().catch((error) => {
				if (signal.aborted) {
					throw new Aborted();
				}
				throw error;
			});
			if (done) {
				break;
			}
			await writer.write(value, written);
			written += value.byteLength;
			progress({ bytes: written, totalBytes: plan.totalBytes });
		}
	} finally {
		await writer.close();
	}
	return written;
}

async function downloadSegments(
	job: Job,
	savePlan: () => Promise<void>,
): Promise<number> {
	const { disk, plan, signal, progress } = job;
	const done = new Set(plan.done);
	let bytes = 0;
	for (const file of plan.files) {
		if (done.has(file.name)) {
			// biome-ignore lint/performance/noAwaitInLoops: summing what is already on disk, before any fetching starts
			bytes += await disk.size(file.name);
		}
	}
	const pending = plan.files.filter((file) => !done.has(file.name));
	await eachUntilFailure(
		pending,
		SEGMENT_CONCURRENCY,
		signal,
		async (file, segmentSignal) => {
			const response = checkedResponse(
				await job.fetchSource(file.url, plan, segmentSignal, file.range),
				`Segment ${file.name}`,
			);
			let data = new Uint8Array(await response.arrayBuffer());
			if (file.range && response.status !== 206) {
				// The server ignored the range: cut the piece out ourselves.
				data = data.slice(file.range.start, file.range.end + 1);
			}
			bytes += await disk.writeWhole(file.name, data);
			plan.done.push(file.name);
			await savePlan();
			progress({
				bytes,
				filesDone: plan.done.length,
				filesTotal: plan.files.length,
			});
		},
	);
	if (signal.aborted) {
		throw new Aborted();
	}
	return bytes;
}

/**
 * Runs one download and reports it through `emit`: `progress` while it goes,
 * then exactly one of `done`, `failed` or `aborted`. Never rejects.
 */
export async function runDownload(
	command: {
		record: DownloadRecord;
		subtitleSources: NewDownload["subtitleSources"];
	},
	io: { disk: Disk; fetchSource: SourceFetch; signal: AbortSignal },
	emit: (event: WorkerEvent) => void,
): Promise<void> {
	const { record } = command;
	try {
		await run(command.record, command.subtitleSources, io, emit);
	} catch (error) {
		if (io.signal.aborted || error instanceof Aborted) {
			emit({ type: "aborted", id: record.id });
			return;
		}
		emit({ type: "failed", id: record.id, error: failureOf(error) });
	}
}

async function run(
	record: DownloadRecord,
	subtitleSources: NewDownload["subtitleSources"],
	{ disk, fetchSource, signal }: Parameters<typeof runDownload>[1],
	emit: (event: WorkerEvent) => void,
): Promise<void> {
	let lastPost = 0;
	const progress = (patch: Partial<DownloadRecord>) => {
		const now = Date.now();
		if (now - lastPost >= PROGRESS_INTERVAL_MS) {
			lastPost = now;
			emit({ type: "progress", id: record.id, patch });
		}
	};

	const saved = await loadPlan(disk);
	const plan: Plan = saved ?? {
		kind: "file",
		entry: "media",
		mimeType: null,
		files: [],
		done: [],
		viaProxy: false,
		subtitles: [],
		totalBytes: null,
	};
	const job: Job = { record, disk, fetchSource, plan, signal, progress };
	if (!saved) {
		await planDownload(job);
		plan.subtitles = await fetchSubtitles(job, subtitleSources);
	}
	const savePlan = planWriter(disk, plan);
	await savePlan();
	emit({
		type: "progress",
		id: record.id,
		patch: {
			kind: plan.kind,
			entry: plan.entry,
			mimeType: plan.mimeType,
			totalBytes: plan.totalBytes,
			filesTotal: plan.kind === "hls" ? plan.files.length : 1,
			subtitles: plan.subtitles,
		},
	});

	const bytes =
		plan.kind === "file"
			? await downloadFile(job)
			: await downloadSegments(job, savePlan);

	emit({
		type: "done",
		id: record.id,
		patch: {
			status: "done",
			error: null,
			bytes,
			totalBytes: plan.kind === "file" ? bytes : null,
			filesDone: plan.kind === "hls" ? plan.files.length : 1,
			completedAt: Date.now(),
		},
	});
}
