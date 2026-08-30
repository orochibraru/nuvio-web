import { describe, expect, it } from "vitest";
import {
	audioSupport,
	describeStream,
	formatFileSize,
	isPlayable,
	pickPreferredStream,
	type ResolvedStream,
	streamKind,
	streamMeta,
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
		infoHash: null,
		filename: null,
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

describe("streamMeta", () => {
	it("pulls structured release info from a torrent-style label", () => {
		const meta = streamMeta(
			stream({
				name: "Torrentio\n4k",
				title:
					"Dune.Part.Two.2024.2160p.BluRay.REMUX.HEVC.DV.HDR.TrueHD.Atmos.7.1\n👤 210 💾 82.4 GB ⚙️ ThePirateBay\n🇬🇧 🇫🇷",
			}),
		);
		expect(meta.quality).toBe("4K");
		expect(meta.source).toBe("REMUX");
		expect(meta.videoCodec).toBe("HEVC");
		expect(meta.audioCodec).toBe("Atmos");
		expect(meta.hdr).toBe("DV");
		expect(meta.seeders).toBe(210);
		expect(meta.size).toBe("82.4 GB");
		expect(meta.languages).toEqual(expect.arrayContaining(["🇬🇧", "🇫🇷"]));
		expect(meta.audio).toBe("risky");
	});

	it("prefers behaviorHints filename and videoSize when present", () => {
		const meta = streamMeta(
			stream({
				filename: "The.Matrix.1999.1080p.WEB-DL.DDP5.1.H.264-GROUP.mkv",
				fileSize: 1_500_000_000,
				title: "The Matrix 1080p",
			}),
		);
		expect(meta.title).toContain("The Matrix 1999 1080p WEB-DL");
		expect(meta.title).not.toContain(".mkv");
		expect(meta.filename).toContain(".mkv");
		expect(meta.size).toBe("1.4 GB");
		expect(meta.videoCodec).toBe("H.264");
	});

	it("marks 10-bit and detects a browser-safe audio codec", () => {
		const meta = streamMeta(
			stream({ title: "Show 1080p WEB-DL 10bit HEVC AAC" }),
		);
		expect(meta.tenBit).toBe(true);
		expect(meta.audioCodec).toBe("AAC");
		expect(meta.audio).toBe("ok");
	});

	it("falls back to the addon name for an empty label", () => {
		expect(streamMeta(stream({})).title).toBe("Torrentio");
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

describe("streamKind", () => {
	it("is p2p for a torrent info hash", () => {
		expect(streamKind(stream({ infoHash: "abc123", url: null }))).toBe("p2p");
	});

	it("is p2p for a magnet url", () => {
		expect(streamKind(stream({ url: "magnet:?xt=urn:btih:abc" }))).toBe("p2p");
	});

	it("is p2p for a notWebReady link with no url", () => {
		expect(
			streamKind(stream({ url: null, externalUrl: null, notWebReady: true })),
		).toBe("p2p");
	});

	it("is direct for a plain http url (incl. debrid-resolved)", () => {
		expect(streamKind(stream({ url: "https://debrid.example/x.mkv" }))).toBe(
			"direct",
		);
		expect(
			streamKind(stream({ url: "https://cdn/x.mp4", infoHash: null })),
		).toBe("direct");
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

	it("prefers browser-friendly audio at the same quality", () => {
		const opts = [
			stream({ index: 0, title: "Movie 1080p BluRay TrueHD Atmos" }),
			stream({ index: 1, title: "Movie 1080p WEB-DL AAC" }),
		];
		expect(pickPreferredStream(opts, "1080p")?.index).toBe(1);
	});

	it("'auto' skips a leading likely-silent stream", () => {
		const opts = [
			stream({ index: 0, title: "Movie 2160p REMUX DTS-HD MA 5.1" }),
			stream({ index: 1, title: "Movie 1080p WEB-DL EAC3" }),
			stream({ index: 2, title: "Movie 1080p WEB-DL AAC" }),
		];
		expect(pickPreferredStream(opts, "auto")?.index).toBe(2);
	});

	it("'auto' keeps the first stream when none are clearly safe", () => {
		const opts = [
			stream({ index: 0, title: "Movie 1080p DD5.1" }),
			stream({ index: 1, title: "Movie 720p AC3" }),
		];
		expect(pickPreferredStream(opts, "auto")?.index).toBe(0);
	});
});

describe("audioSupport", () => {
	it("flags Dolby / DTS codec tags with no AAC fallback", () => {
		expect(audioSupport(stream({ title: "Movie 1080p EAC3 5.1" }))).toBe(
			"risky",
		);
		expect(audioSupport(stream({ title: "Movie REMUX TrueHD Atmos" }))).toBe(
			"risky",
		);
		expect(audioSupport(stream({ name: "Movie DTS-HD MA" }))).toBe("risky");
	});

	it("treats an explicit AAC/Opus tag as safe even next to a Dolby tag", () => {
		expect(audioSupport(stream({ title: "Movie WEB-DL AAC" }))).toBe("ok");
		expect(
			audioSupport(stream({ title: "Movie EAC3 -> AAC (transcoded)" })),
		).toBe("ok");
	});

	it("defaults to ok when the label says nothing about audio", () => {
		expect(audioSupport(stream({ title: "Movie 1080p BluRay x265" }))).toBe(
			"ok",
		);
	});
});
