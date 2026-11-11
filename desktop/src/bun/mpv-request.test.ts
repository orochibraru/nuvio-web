import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { mpvArguments, parseMpvRequest } from "./mpv-request.ts";

const downloads = mkdtempSync(join(tmpdir(), "nuvio-mpv-"));
const DOWNLOAD_ID = "0b6f2c56-3f0e-4c2c-9b8e-1b5d3a2f9e10";
mkdirSync(join(downloads, "Film (2020)"));
writeFileSync(
	join(downloads, "Film (2020)", ".nuvio.json"),
	JSON.stringify({ id: DOWNLOAD_ID, status: "done", entry: "Film (2020).mkv" }),
);
afterAll(() => rmSync(downloads, { recursive: true, force: true }));

describe("parseMpvRequest", () => {
	it("takes an http(s) source with its headers and subtitles", () => {
		expect(
			parseMpvRequest(
				{
					url: "https://cdn.example/v.mkv",
					title: "Film",
					start: 42,
					headers: { Referer: "https://host.example/?a=1,2", Host: "x" },
					subtitles: [
						"https://subs.example/en.srt",
						"https://subs.example/en.srt",
						"file:///etc/passwd",
						"/api/local.srt",
						7,
					],
				},
				downloads,
			),
		).toEqual({
			url: "https://cdn.example/v.mkv",
			title: "Film",
			start: 42,
			headerFields: ["referer: https://host.example/?a=1,2"],
			subtitles: ["https://subs.example/en.srt"],
		});
	});

	it("caps the subtitles mpv fetches before it starts", () => {
		const subtitles = Array.from(
			{ length: 30 },
			(_, index) => `https://subs.example/${index}.srt`,
		);
		expect(
			parseMpvRequest({ url: "https://cdn.example/v", subtitles }, downloads)
				?.subtitles,
		).toHaveLength(10);
	});

	it("resolves a download by id, and never sends it headers", () => {
		expect(
			parseMpvRequest(
				{
					url: `nuvio-download:${DOWNLOAD_ID}`,
					title: "Film",
					start: -1,
					headers: { referer: "https://host.example" },
				},
				downloads,
			),
		).toEqual({
			url: join(downloads, "Film (2020)", "Film (2020).mkv"),
			title: "Film",
			start: 0,
			headerFields: [],
			subtitles: [],
		});
	});

	it("refuses another scheme, an unknown download and a malformed request", () => {
		expect(
			parseMpvRequest({ url: "file:///etc/passwd" }, downloads),
		).toBeNull();
		expect(
			parseMpvRequest(
				{ url: "nuvio-download:00000000-0000-0000-0000-000000000000" },
				downloads,
			),
		).toBeNull();
		expect(parseMpvRequest(null, downloads)).toBeNull();
		expect(parseMpvRequest({ url: 1 }, downloads)).toBeNull();
	});
});

describe("mpvArguments", () => {
	it("appends each header and subtitle whole, commas included, before the source", () => {
		const args = mpvArguments(
			"/usr/bin/mpv",
			{
				url: "https://cdn.example/v.mkv",
				title: "Film",
				start: 12,
				headerFields: [
					"referer: https://host.example/?a=1,2",
					"cookie: a=1, b=2",
				],
				subtitles: ["https://subs.example/en.srt"],
			},
			"/tmp/mpv.sock",
		);
		expect(args[0]).toBe("/usr/bin/mpv");
		expect(args).toContain("--start=12");
		expect(args).toContain("--input-ipc-server=/tmp/mpv.sock");
		expect(args).toContain(
			"--http-header-fields-append=referer: https://host.example/?a=1,2",
		);
		expect(args).toContain("--http-header-fields-append=cookie: a=1, b=2");
		expect(args).toContain("--sub-files-append=https://subs.example/en.srt");
		expect(args.slice(-2)).toEqual(["--", "https://cdn.example/v.mkv"]);
		expect(args.some((arg) => arg.startsWith("--http-header-fields="))).toBe(
			false,
		);
	});

	it("adds nothing for a source without headers or subtitles", () => {
		const args = mpvArguments(
			"mpv",
			{ url: "/v.mkv", title: "", start: 0, headerFields: [], subtitles: [] },
			"ipc",
		);
		expect(args.filter((arg) => arg.includes("-append="))).toEqual([]);
	});
});
