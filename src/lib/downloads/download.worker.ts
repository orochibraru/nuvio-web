import { pooledMap } from "#lib/core/pool.js";
import { DOWNLOADS_DIR, PLAN_FILE, proxiedUrl } from "./files.ts";
import {
	chooseAudio,
	chooseVariant,
	HlsDownloadError,
	isHlsPlaylist,
	isMasterPlaylist,
	localMasterPlaylist,
	type PlannedFile,
	parseMasterPlaylist,
	planMediaPlaylist,
} from "./hls.ts";
import type {
	DownloadedSubtitle,
	DownloadRecord,
	NewDownload,
	WorkerCommand,
	WorkerEvent,
} from "./types.ts";

/**
 * Fetches one download at a time into the Origin Private File System. A worker
 * so that writing gigabytes never touches the page's main thread, and because
 * `createSyncAccessHandle` (the one OPFS write API every browser has) only
 * exists in workers.
 *
 * Resumable either way: a direct file continues with a `Range` request from
 * the bytes already on disk, and an HLS copy records each finished file in
 * `plan.json` and skips it next time.
 */

/** The OPFS write handle, which lib.dom leaves out (it is worker-only). */
interface SyncAccessHandle {
	write: (data: Uint8Array, options: { at: number }) => number;
	truncate: (size: number) => void;
	flush: () => void;
	close: () => void;
}

interface WorkerScope {
	postMessage: (message: unknown) => void;
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<WorkerCommand>) => void,
	) => void;
}

const scope = self as unknown as WorkerScope;

/** Segments are small and many; a few at a time keeps a CDN happy. */
const SEGMENT_CONCURRENCY = 3;
const PROGRESS_INTERVAL_MS = 250;

interface Plan {
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

class Aborted extends Error {}

function post(event: WorkerEvent): void {
	scope.postMessage(event);
}

// -- File system ---------------------------------------------------------------

async function downloadDir(id: string): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	const downloads = await root.getDirectoryHandle(DOWNLOADS_DIR, {
		create: true,
	});
	return downloads.getDirectoryHandle(id, { create: true });
}

async function subDir(
	dir: FileSystemDirectoryHandle,
	path: string,
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
	const parts = path.split("/");
	let parent = dir;
	for (const part of parts.slice(0, -1)) {
		// biome-ignore lint/performance/noAwaitInLoops: walking a path is sequential
		parent = await parent.getDirectoryHandle(part, { create: true });
	}
	return { parent, name: parts.at(-1) as string };
}

async function openWriter(dir: FileSystemDirectoryHandle, path: string) {
	const { parent, name } = await subDir(dir, path);
	const handle = await parent.getFileHandle(name, { create: true });
	return (
		handle as unknown as {
			createSyncAccessHandle: () => Promise<SyncAccessHandle>;
		}
	).createSyncAccessHandle();
}

async function writeWhole(
	dir: FileSystemDirectoryHandle,
	path: string,
	data: ArrayBuffer | Uint8Array | string,
): Promise<number> {
	const bytes =
		typeof data === "string"
			? new TextEncoder().encode(data)
			: data instanceof Uint8Array
				? data
				: new Uint8Array(data);
	const access = await openWriter(dir, path);
	try {
		access.truncate(0);
		access.write(bytes, { at: 0 });
		access.flush();
	} finally {
		access.close();
	}
	return bytes.byteLength;
}

async function readText(
	dir: FileSystemDirectoryHandle,
	path: string,
): Promise<string | null> {
	try {
		const handle = await dir.getFileHandle(path);
		return await (await handle.getFile()).text();
	} catch {
		return null;
	}
}

async function fileSize(
	dir: FileSystemDirectoryHandle,
	path: string,
): Promise<number> {
	try {
		return (await (await dir.getFileHandle(path)).getFile()).size;
	} catch {
		return 0;
	}
}

// -- Network -------------------------------------------------------------------

/**
 * Fetches `url` directly, and through the same-origin pass-through when the
 * browser can't: a host without CORS headers, or plain `http:` from an
 * `https:` page (the CSP and mixed-content rules both refuse it). Either
 * failure surfaces as a `TypeError`; once one does, the rest of the download
 * goes through the proxy too.
 */
async function fetchSource(
	url: string,
	plan: Pick<Plan, "viaProxy">,
	signal: AbortSignal,
	range: { start: number; end: number | null } | null = null,
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (range) {
		headers.range = `bytes=${range.start}-${range.end ?? ""}`;
	}
	if (!plan.viaProxy) {
		try {
			return await fetch(url, { signal, headers, mode: "cors" });
		} catch (error) {
			if (signal.aborted) {
				throw new Aborted();
			}
			if (!(error instanceof TypeError)) {
				throw error;
			}
			plan.viaProxy = true;
		}
	}
	try {
		return await fetch(proxiedUrl(url), { signal, headers });
	} catch (error) {
		if (signal.aborted) {
			throw new Aborted();
		}
		throw error;
	}
}

function checkedResponse(response: Response, what: string): Response {
	if (response.ok) {
		return response;
	}
	if (response.status === 416) {
		return response;
	}
	throw new Error(`${what} answered ${response.status}.`);
}

async function ensureRoom(bytesNeeded: number): Promise<void> {
	const { quota, usage } = await navigator.storage.estimate();
	if (quota === undefined || usage === undefined) {
		return;
	}
	const free = quota - usage;
	if (bytesNeeded > free) {
		const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
		throw new Error(
			`Not enough storage: this needs ${gb(bytesNeeded)}, ${gb(free)} is free.`,
		);
	}
}

// -- Jobs ----------------------------------------------------------------------

let current: { id: string; controller: AbortController } | null = null;

async function loadPlan(dir: FileSystemDirectoryHandle): Promise<Plan | null> {
	const text = await readText(dir, PLAN_FILE);
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
function planWriter(dir: FileSystemDirectoryHandle, plan: Plan) {
	let chain = Promise.resolve();
	return () => {
		chain = chain.then(async () => {
			await writeWhole(dir, PLAN_FILE, JSON.stringify(plan));
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
	dir: FileSystemDirectoryHandle;
	plan: Plan;
	signal: AbortSignal;
	progress: (patch: Partial<DownloadRecord>) => void;
}

async function fetchText(job: Job, url: string, what: string): Promise<string> {
	const response = await fetchSource(url, job.plan, job.signal);
	return checkedResponse(response, what).text();
}

/**
 * Probes the source with a one-byte range. A playlist comes back as its text;
 * anything else is a direct file, and its size and type go on the plan.
 */
async function sniffPlaylist(job: Job): Promise<string | null> {
	const { record, plan, signal } = job;
	const probe = checkedResponse(
		await fetchSource(record.sourceUrl, plan, signal, { start: 0, end: 0 }),
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
	await writeWhole(job.dir, local.name, media.playlist);
	job.plan.files.push(...media.files);
}

/** A master playlist: one variant, its separate audio, and a local master. */
async function planMaster(job: Job, playlist: string): Promise<void> {
	const master = parseMasterPlaylist(playlist, job.record.sourceUrl);
	const variant = chooseVariant(master.variants, job.record.quality);
	if (!variant) {
		throw new HlsDownloadError("The playlist lists no video.");
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
	await writeWhole(
		job.dir,
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
		throw new HlsDownloadError("The source is not a playlist.");
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
	sources: NewDownload["subtitleSources"],
	dir: FileSystemDirectoryHandle,
	plan: Plan,
	signal: AbortSignal,
): Promise<DownloadedSubtitle[]> {
	const kept: DownloadedSubtitle[] = [];
	for (const [index, source] of sources.entries()) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: a handful of small files, one after another, is kinder to a subtitle host than a burst
			const response = await fetchSource(
				source.url,
				{ viaProxy: plan.viaProxy },
				signal,
			);
			if (!response.ok) {
				continue;
			}
			const file = `${index + 1}.srt`;
			await writeWhole(dir, `subs/${file}`, await response.text());
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
	const { record, dir, plan, signal, progress } = job;
	let written = await fileSize(dir, "media");
	if (plan.totalBytes !== null && written >= plan.totalBytes) {
		return written;
	}
	if (plan.totalBytes !== null) {
		await ensureRoom(plan.totalBytes - written);
	}
	const response = checkedResponse(
		await fetchSource(record.sourceUrl, plan, signal, {
			start: written,
			end: null,
		}),
		"The source",
	);
	if (response.status === 416) {
		return written;
	}
	const access = await openWriter(dir, "media");
	try {
		const length = Number(response.headers.get("content-length"));
		if (response.status !== 206) {
			// The server ignored the range and sent the whole file: start over.
			written = 0;
			access.truncate(0);
			if (length > 0) {
				plan.totalBytes = length;
				await ensureRoom(length);
			}
		} else if (plan.totalBytes === null && length > 0) {
			// The probe couldn't read `Content-Range` (not CORS-exposed by
			// default), but `Content-Length` always is : it's what's left.
			plan.totalBytes = written + length;
			await ensureRoom(length);
		}
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("The source sent no data.");
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
			access.write(value, { at: written });
			written += value.byteLength;
			progress({ bytes: written, totalBytes: plan.totalBytes });
		}
		access.flush();
	} finally {
		access.close();
	}
	return written;
}

async function downloadSegments(
	job: Job,
	savePlan: () => Promise<void>,
): Promise<number> {
	const { dir, plan, signal, progress } = job;
	const done = new Set(plan.done);
	let bytes = 0;
	for (const file of plan.files) {
		if (done.has(file.name)) {
			// biome-ignore lint/performance/noAwaitInLoops: summing what is already on disk, before any fetching starts
			bytes += await fileSize(dir, file.name);
		}
	}
	const pending = plan.files.filter((file) => !done.has(file.name));
	await pooledMap(pending, SEGMENT_CONCURRENCY, async (file) => {
		if (signal.aborted) {
			throw new Aborted();
		}
		const response = checkedResponse(
			await fetchSource(file.url, plan, signal, file.range),
			`Segment ${file.name}`,
		);
		let data = new Uint8Array(await response.arrayBuffer());
		if (file.range && response.status !== 206) {
			// The server ignored the range: cut the piece out ourselves.
			data = data.slice(file.range.start, file.range.end + 1);
		}
		bytes += await writeWhole(dir, file.name, data);
		plan.done.push(file.name);
		await savePlan();
		progress({
			bytes,
			filesDone: plan.done.length,
			filesTotal: plan.files.length,
		});
	});
	return bytes;
}

async function run(
	record: DownloadRecord,
	subtitleSources: NewDownload["subtitleSources"],
	signal: AbortSignal,
): Promise<void> {
	const dir = await downloadDir(record.id);
	let lastPost = 0;
	const progress = (patch: Partial<DownloadRecord>) => {
		const now = Date.now();
		if (now - lastPost >= PROGRESS_INTERVAL_MS) {
			lastPost = now;
			post({ type: "progress", id: record.id, patch });
		}
	};

	const saved = await loadPlan(dir);
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
	const job: Job = { record, dir, plan, signal, progress };
	if (!saved) {
		await planDownload(job);
		plan.subtitles = await fetchSubtitles(subtitleSources, dir, plan, signal);
	}
	const savePlan = planWriter(dir, plan);
	await savePlan();
	post({
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

	post({
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

scope.addEventListener("message", (event) => {
	const command = event.data;
	if (command.type === "abort") {
		if (current?.id === command.id) {
			current.controller.abort();
		}
		return;
	}
	const controller = new AbortController();
	current = { id: command.record.id, controller };
	run(command.record, command.subtitleSources, controller.signal)
		.catch((error: unknown) => {
			if (controller.signal.aborted || error instanceof Aborted) {
				post({ type: "aborted", id: command.record.id });
				return;
			}
			post({
				type: "failed",
				id: command.record.id,
				error: error instanceof Error ? error.message : "The download failed.",
			});
		})
		.finally(() => {
			if (current?.controller === controller) {
				current = null;
			}
		});
});
