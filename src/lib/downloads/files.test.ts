import { describe, expect, it } from "vitest";
import {
	contentTypeFor,
	localMediaUrl,
	parseLocalMediaPath,
	parseRange,
	proxiedUrl,
} from "./files.ts";

const ID = "0b6c1f4e-8d2a-4c3b-9e7f-1a2b3c4d5e6f";

describe("parseLocalMediaPath", () => {
	it("round-trips what localMediaUrl builds", () => {
		expect(parseLocalMediaPath(localMediaUrl(ID, "media"))).toEqual({
			id: ID,
			path: "media",
		});
		expect(parseLocalMediaPath(localMediaUrl(ID, "subs/1.srt"))).toEqual({
			id: ID,
			path: "subs/1.srt",
		});
	});

	it("refuses anything that could leave the download's directory", () => {
		for (const path of [
			"/offline-media/not-a-uuid/media",
			`/offline-media/${ID}`,
			`/offline-media/${ID}/../other/media`,
			`/offline-media/${ID}/..`,
			`/offline-media/${ID}/%2e%2e/x`,
			`/offline-media/${ID}/a/b/c`,
			"/somewhere/else",
		]) {
			expect(parseLocalMediaPath(path)).toBeNull();
		}
	});
});

describe("contentTypeFor", () => {
	it("uses the recorded type for a direct file, the extension otherwise", () => {
		expect(contentTypeFor("media", "video/webm")).toBe("video/webm");
		expect(contentTypeFor("media", null)).toBe("video/mp4");
		expect(contentTypeFor("index.m3u8", null)).toBe(
			"application/vnd.apple.mpegurl",
		);
		expect(contentTypeFor("video-seg-00001.TS", null)).toBe("video/mp2t");
		expect(contentTypeFor("mystery", null)).toBe("application/octet-stream");
	});
});

describe("parseRange", () => {
	it("serves the whole file without a usable header", () => {
		expect(parseRange(null, 100)).toBeNull();
		expect(parseRange("bytes=-", 100)).toBeNull();
		expect(parseRange("items=0-1", 100)).toBeNull();
	});

	it("reads start-end, open-ended and suffix ranges", () => {
		expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
		expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
		expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
		expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
	});

	it("flags ranges past the end", () => {
		expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
		expect(parseRange("bytes=9-3", 100)).toBe("unsatisfiable");
	});
});

describe("proxiedUrl", () => {
	it("encodes the source into the query", () => {
		expect(proxiedUrl("https://cdn.example/a b.mp4?x=1&y=2")).toBe(
			"/api/downloads/proxy?url=https%3A%2F%2Fcdn.example%2Fa%20b.mp4%3Fx%3D1%26y%3D2",
		);
	});
});
