import { describe, expect, it } from "vitest";
import {
	describeStream,
	formatFileSize,
	isPlayable,
	pickPreferredStream,
	type ResolvedStream,
	streamQuality,
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

describe("streamQuality", () => {
	it("extracts the resolution tag or null", () => {
		expect(streamQuality(stream({ title: "Movie 1080p WEB-DL" }))).toBe(
			"1080p",
		);
		expect(streamQuality(stream({ name: "Movie 2160p" }))).toBe("4K");
		expect(streamQuality(stream({ title: "Movie BluRay" }))).toBeNull();
	});
});

describe("pickPreferredStream", () => {
	const streams = [
		stream({ index: 0, title: "Movie 720p WEB" }),
		stream({ index: 1, title: "Movie 4K REMUX" }),
		stream({ index: 2, title: "Movie 1080p BluRay" }),
		stream({ index: 3, title: "Movie 480p" }),
	];

	it("keeps the addon order for 'auto'", () => {
		expect(pickPreferredStream(streams, "auto")?.index).toBe(0);
	});

	it("returns an exact quality match", () => {
		expect(pickPreferredStream(streams, "1080p")?.index).toBe(2);
	});

	it("falls to the closest quality at or below the target", () => {
		expect(pickPreferredStream(streams, "1440p")?.index).toBe(2);
	});

	it("falls upward when nothing is at or below the target", () => {
		const low = [stream({ index: 5, title: "Movie 4K" })];
		expect(pickPreferredStream(low, "720p")?.index).toBe(5);
	});

	it("never returns a non-playable stream when a playable one exists", () => {
		const mixed = [
			stream({ index: 6, title: "Movie 1080p", notWebReady: true, url: null }),
			stream({ index: 7, title: "Movie 720p" }),
		];
		expect(pickPreferredStream(mixed, "1080p")?.index).toBe(7);
	});
});
