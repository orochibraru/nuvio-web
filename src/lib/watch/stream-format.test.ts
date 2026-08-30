import { describe, expect, it } from "vitest";
import {
	describeStream,
	formatFileSize,
	isPlayable,
	type ResolvedStream,
} from "./stream-format.js";

function stream(over: Partial<ResolvedStream>): ResolvedStream {
	return {
		index: 0,
		url: "https://example.com/v.mp4",
		externalUrl: null,
		notWebReady: false,
		name: null,
		title: null,
		description: null,
		addonName: "Torrentio",
		fileSize: null,
		...over,
	};
}

describe("describeStream", () => {
	it("pulls a single quality tag plus features", () => {
		const { title, tags } = describeStream(
			stream({
				name: "Torrentio 1080p",
				title: "Fight.Club.1999.1080p.BluRay.x265.HDR",
			}),
		);
		expect(title).toContain("Torrentio 1080p");
		expect(tags).toContain("1080p");
		expect(tags).toContain("HEVC");
		expect(tags).toContain("HDR");
		expect(tags).toContain("BluRay");
		// only one resolution tag
		expect(tags.filter((t) => /p$|4K/.test(t))).toHaveLength(1);
	});

	it("maps 2160p / UHD to 4K", () => {
		expect(describeStream(stream({ title: "Movie 2160p" })).tags).toContain(
			"4K",
		);
		expect(describeStream(stream({ name: "UHD REMUX" })).tags).toContain("4K");
	});

	it("falls back to the addon name when the label is empty", () => {
		expect(describeStream(stream({})).title).toBe("Torrentio");
	});

	it("truncates very long labels", () => {
		const long = "x".repeat(200);
		expect(describeStream(stream({ name: long })).title.length).toBeLessThan(
			95,
		);
	});
});

describe("formatFileSize", () => {
	it("scales bytes to a readable unit", () => {
		expect(formatFileSize(1_500_000_000)).toBe("1.4 GB");
		expect(formatFileSize(700_000_000)).toBe("668 MB");
		expect(formatFileSize(0)).toBeNull();
		expect(formatFileSize(null)).toBeNull();
	});
});

describe("isPlayable", () => {
	it("requires a url and web-ready", () => {
		expect(isPlayable(stream({}))).toBe(true);
		expect(isPlayable(stream({ url: null }))).toBe(false);
		expect(isPlayable(stream({ notWebReady: true }))).toBe(false);
	});
});
