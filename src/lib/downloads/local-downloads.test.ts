import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "#lib/services/logger.service.js";
import type { SourceFetch } from "./job.ts";
import { LocalDownloads } from "./local-downloads.ts";
import type { DownloadRecord, NewDownload } from "./types.ts";

const OWNER = "user:1";
const FILE = new Uint8Array(1000).map((_, index) => index % 251);
const logger = { warn: () => undefined } as unknown as Logger;

function input(over: Partial<NewDownload> = {}): NewDownload {
	return {
		type: "movie",
		contentId: "tt1",
		videoId: "tt1",
		season: null,
		episode: null,
		title: "A film",
		subtitle: null,
		poster: null,
		background: null,
		sourceUrl: "https://cdn.example/film.mkv",
		sourceLabel: "1080p",
		addonName: "Addon",
		quality: "1080p",
		subtitleSources: [],
		...over,
	};
}

/** A host serving `body` with byte ranges, the way a debrid CDN does. */
function rangeResponse(
	body: Uint8Array<ArrayBuffer>,
	range: { start: number; end: number | null } | null | undefined,
	type = "video/x-matroska",
): Response {
	if (!range) {
		return new Response(body, { headers: { "content-type": type } });
	}
	const end = Math.min(range.end ?? body.length - 1, body.length - 1);
	if (range.start >= body.length) {
		return new Response(null, { status: 416 });
	}
	return new Response(body.slice(range.start, end + 1), {
		status: 206,
		headers: {
			"content-type": type,
			"content-range": `bytes ${range.start}-${end}/${body.length}`,
			"content-length": String(end - range.start + 1),
		},
	});
}

const serveFile: SourceFetch = async (_url, _plan, _signal, range) =>
	rangeResponse(FILE, range);

async function settled(downloads: LocalDownloads): Promise<DownloadRecord> {
	let record: DownloadRecord | undefined;
	await vi.waitFor(
		async () => {
			[record] = await downloads.list(OWNER);
			if (!(record && ["done", "error", "paused"].includes(record.status))) {
				throw new Error(`still ${record?.status ?? "missing"}`);
			}
		},
		{ timeout: 3000, interval: 10 },
	);
	return record as DownloadRecord;
}

let folder: string;
beforeEach(async () => {
	folder = await mkdtemp(join(tmpdir(), "nuvio-downloads-"));
});
afterEach(async () => {
	await rm(folder, { recursive: true, force: true });
});

describe("LocalDownloads", () => {
	it("downloads a direct file into a folder named like a library's", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(
			OWNER,
			input({
				subtitleSources: [
					{ lang: "en", sdh: false, url: "https://subs.example/1.srt" },
				],
			}),
		);
		const record = await settled(downloads);

		expect(record).toMatchObject({
			status: "done",
			onDisk: true,
			kind: "file",
			folder: "A film",
			entry: "A film.mkv",
			bytes: FILE.length,
			subtitles: [{ lang: "en", path: "A film.en.srt" }],
		});
		expect((await readdir(join(folder, "A film"))).sort()).toEqual([
			".nuvio.json",
			"A film.en.srt",
			"A film.mkv",
		]);
		const file = await downloads.file(OWNER, record.id, "A film.mkv");
		expect(new Uint8Array(await readFile(file?.path ?? ""))).toEqual(FILE);
		expect(file?.mimeType).toBe("video/x-matroska");
		expect(
			await downloads.file(OWNER, record.id, "A film.en.srt"),
		).not.toBeNull();
	});

	it("numbers the folder when the name is taken", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(OWNER, input());
		await settled(downloads);
		await downloads.add("user:2", input());
		await vi.waitFor(
			async () => {
				const [other] = await downloads.list("user:2");
				if (other?.status !== "done") {
					throw new Error("still running");
				}
			},
			{ timeout: 3000, interval: 10 },
		);
		expect((await downloads.list("user:2"))[0]).toMatchObject({
			folder: "A film (2)",
			entry: "A film (2).mkv",
		});
	});

	it("names a download finished before files were named, from its id folder", async () => {
		const id = "0b6c1f4e-8d2a-4c3b-9e7f-1a2b3c4d5e6f";
		const legacy = join(folder, id);
		await mkdir(join(legacy, "subs"), { recursive: true });
		const mp4 = new Uint8Array([
			0,
			0,
			0,
			0x18,
			...new TextEncoder().encode("ftypisom"),
		]);
		await writeFile(join(legacy, "media"), mp4);
		await writeFile(join(legacy, "subs", "1.srt"), "1");
		await writeFile(join(legacy, "plan.json"), "{}");
		await writeFile(
			join(legacy, "record.json"),
			JSON.stringify({
				...input(),
				subtitleSources: undefined,
				sourceUrl: "https://debrid.example/api/debrid/abc/0",
				id,
				onDisk: true,
				owner: OWNER,
				kind: "file",
				entry: "media",
				mimeType: "video/mp4",
				status: "done",
				subtitles: [{ lang: "eng", sdh: false, file: "1.srt" }],
				createdAt: 1,
			}),
		);

		const downloads = new LocalDownloads(folder, logger, serveFile);
		expect((await downloads.list(OWNER))[0]).toMatchObject({
			folder: "A film",
			entry: "A film.mp4",
			subtitles: [{ path: "A film.eng.srt" }],
		});
		expect(await readdir(folder)).toEqual(["A film"]);
		expect((await readdir(join(folder, "A film"))).sort()).toEqual([
			".nuvio.json",
			"A film.eng.srt",
			"A film.mp4",
		]);
	});

	it("keeps one download per video", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(OWNER, input());
		await downloads.add(OWNER, input({ sourceUrl: "https://other.example/x" }));
		expect(await downloads.list(OWNER)).toHaveLength(1);
		await settled(downloads);
	});

	it("reads its downloads back from the folder on the next start", async () => {
		const first = new LocalDownloads(folder, logger, serveFile);
		await first.add(OWNER, input());
		const record = await settled(first);

		const second = new LocalDownloads(folder, logger, serveFile);
		expect(await second.list(OWNER)).toEqual([record]);
	});

	it("resumes a paused download from the bytes already on disk", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ranges: Array<number | null> = [];
		// The first full request sends half the file, then hangs until aborted.
		const flaky: SourceFetch = async (_url, _plan, signal, range) => {
			ranges.push(range?.start ?? null);
			if (ranges.length !== 2) {
				return rangeResponse(FILE, range);
			}
			const half = FILE.slice(0, 500);
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(half);
					signal.addEventListener("abort", () =>
						controller.error(new Error("aborted")),
					);
					void stalled;
				},
			});
			return new Response(body, {
				status: 206,
				headers: { "content-length": String(FILE.length) },
			});
		};
		const downloads = new LocalDownloads(folder, logger, flaky);
		await downloads.add(OWNER, input());
		const [started] = await downloads.list(OWNER);
		await vi.waitFor(
			async () => {
				expect(
					(await stat(join(folder, "A film", "media")).catch(() => null))?.size,
				).toBe(500);
			},
			{ timeout: 3000, interval: 10 },
		);

		await downloads.pause(OWNER, started.id);
		expect((await downloads.list(OWNER))[0].status).toBe("paused");
		release();

		await downloads.resume(OWNER, started.id);
		const record = await settled(downloads);
		expect(record.status).toBe("done");
		expect(ranges.at(-1)).toBe(500);
		const file = await downloads.file(OWNER, record.id, "A film.mkv");
		expect(new Uint8Array(await readFile(file?.path ?? ""))).toEqual(FILE);
	});

	it("puts a download cut off by a quit back in the queue", async () => {
		const first = new LocalDownloads(folder, logger, serveFile);
		await first.add(OWNER, input());
		const record = await settled(first);
		await writeFile(
			join(folder, "A film", ".nuvio.json"),
			JSON.stringify({
				...record,
				status: "downloading",
				kind: null,
				entry: null,
			}),
		);
		await rm(join(folder, "A film", "A film.mkv"));

		const second = new LocalDownloads(folder, logger, serveFile);
		await second.list(OWNER);
		expect(await settled(second)).toMatchObject({
			status: "done",
			entry: "A film.mkv",
		});
	});

	it("copies an HLS stream: its playlist, then every segment", async () => {
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:4",
			"#EXTINF:4,",
			"seg0.ts",
			"#EXTINF:4,",
			"seg1.ts",
			"#EXT-X-ENDLIST",
		].join("\n");
		const hls: SourceFetch = async (url) => {
			if (url.endsWith(".m3u8")) {
				return new Response(playlist, {
					headers: { "content-type": "application/vnd.apple.mpegurl" },
				});
			}
			return new Response(new Uint8Array([1, 2, 3]));
		};
		const downloads = new LocalDownloads(folder, logger, hls);
		await downloads.add(
			OWNER,
			input({ sourceUrl: "https://cdn.example/live/index.m3u8" }),
		);
		const record = await settled(downloads);

		expect(record).toMatchObject({
			status: "done",
			kind: "hls",
			entry: "A film.m3u8",
			filesDone: 2,
		});
		expect(
			await downloads.file(OWNER, record.id, "A film.m3u8"),
		).not.toBeNull();
		const segment = (await readdir(join(folder, "A film"))).find((name) =>
			name.startsWith("video-"),
		);
		expect(
			await downloads.file(OWNER, record.id, segment ?? "missing"),
		).not.toBeNull();
	});

	it("sends the addon's headers for the stream, never for a subtitle", async () => {
		const seen: Array<[string, Record<string, string> | undefined]> = [];
		const recording: SourceFetch = async (url, plan, _signal, range) => {
			seen.push([url, plan.requestHeaders]);
			return rangeResponse(FILE, range);
		};
		const requestHeaders = { referer: "https://host.example/" };
		const downloads = new LocalDownloads(folder, logger, recording);
		await downloads.add(
			OWNER,
			input({
				requestHeaders,
				subtitleSources: [
					{ lang: "en", sdh: false, url: "https://subs.example/1.srt" },
				],
			}),
		);
		expect(await settled(downloads)).toMatchObject({
			status: "done",
			requestHeaders,
		});
		for (const [url, headers] of seen) {
			expect(headers).toEqual(
				url.startsWith("https://subs.example/") ? undefined : requestHeaders,
			);
		}
		expect(seen.filter(([url]) => url === input().sourceUrl)).toHaveLength(2);
	});

	it("sends them for every playlist and segment, and again after a relaunch", async () => {
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:4",
			"#EXTINF:4,",
			"seg0.ts",
			"#EXT-X-ENDLIST",
		].join("\n");
		const seen: Array<Record<string, string> | undefined> = [];
		const hls: SourceFetch = async (url, plan) => {
			seen.push(plan.requestHeaders);
			return url.endsWith(".m3u8")
				? new Response(playlist)
				: new Response(new Uint8Array([1]));
		};
		const requestHeaders = { "user-agent": "Addon/1" };
		const first = new LocalDownloads(folder, logger, hls);
		await first.add(
			OWNER,
			input({
				sourceUrl: "https://cdn.example/index.m3u8",
				requestHeaders,
			}),
		);
		const record = await settled(first);
		await writeFile(
			join(folder, "A film", ".nuvio.json"),
			JSON.stringify({ ...record, status: "downloading", entry: null }),
		);

		expect(seen).toEqual([requestHeaders, requestHeaders, requestHeaders]);

		seen.length = 0;
		const second = new LocalDownloads(folder, logger, hls);
		await second.list(OWNER);
		expect(await settled(second)).toMatchObject({ status: "done" });
		expect(seen.length).toBeGreaterThan(0);
		expect(seen).toEqual(seen.map(() => requestHeaders));
	});

	it("records why a download failed", async () => {
		const gone: SourceFetch = async () => new Response(null, { status: 404 });
		const downloads = new LocalDownloads(folder, logger, gone);
		await downloads.add(OWNER, input());
		expect(await settled(downloads)).toMatchObject({
			status: "error",
			error: "http:404",
		});
	});

	it("keeps another profile's downloads out of reach", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(OWNER, input());
		const record = await settled(downloads);

		expect(await downloads.list("user:2")).toEqual([]);
		expect(await downloads.file("user:2", record.id, "A film.mkv")).toBeNull();
		await downloads.remove("user:2", record.id);
		expect(await downloads.list(OWNER)).toHaveLength(1);
	});

	it("never serves a path outside the download, nor its record", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(OWNER, input());
		const { id } = await settled(downloads);

		for (const path of ["../x", ".nuvio.json", "media", "a/b/c", ""]) {
			expect(await downloads.file(OWNER, id, path)).toBeNull();
		}
	});

	it("removes a download and its files", async () => {
		const downloads = new LocalDownloads(folder, logger, serveFile);
		await downloads.add(OWNER, input());
		const { id } = await settled(downloads);

		await downloads.remove(OWNER, id);
		expect(await downloads.list(OWNER)).toEqual([]);
		expect(await stat(join(folder, "A film")).catch(() => null)).toBeNull();
	});
});
