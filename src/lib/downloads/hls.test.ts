import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	chooseAudio,
	chooseVariant,
	HlsDownloadError,
	isHlsPlaylist,
	isMasterPlaylist,
	localMasterPlaylist,
	parseAttributes,
	parseMasterPlaylist,
	planMediaPlaylist,
} from "./hls.ts";

const fixture = (path: string) =>
	readFileSync(new URL(`../../../static/e2e/${path}`, import.meta.url), "utf8");

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Français",LANGUAGE="fr",URI="audio/fr.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="subs/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2",AUDIO="aac",SUBTITLES="subs"
360/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aac",SUBTITLES="subs"
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="aac",SUBTITLES="subs"
720/index.m3u8
`;

const BASE = "https://cdn.example/show/master.m3u8";

describe("parseAttributes", () => {
	it("reads quoted values with commas, and bare ones", () => {
		expect(
			parseAttributes(
				'BANDWIDTH=800000,CODECS="avc1.4d401e,mp4a.40.2",NAME="A, B"',
			),
		).toEqual({
			BANDWIDTH: "800000",
			CODECS: "avc1.4d401e,mp4a.40.2",
			NAME: "A, B",
		});
	});
});

describe("playlist detection", () => {
	it("tells playlists, and master from media", () => {
		expect(isHlsPlaylist(fixture("hls-ts/master.m3u8"))).toBe(true);
		expect(isHlsPlaylist("<html>")).toBe(false);
		expect(isMasterPlaylist(fixture("hls-ts/master.m3u8"))).toBe(true);
		expect(isMasterPlaylist(fixture("hls-ts/v/index.m3u8"))).toBe(false);
	});
});

describe("parseMasterPlaylist", () => {
	it("resolves variant and rendition URIs against the playlist", () => {
		const master = parseMasterPlaylist(MASTER, BASE);
		expect(master.variants.map((v) => [v.url, v.height, v.bandwidth])).toEqual([
			["https://cdn.example/show/360/index.m3u8", 360, 800_000],
			["https://cdn.example/show/1080/index.m3u8", 1080, 5_000_000],
			["https://cdn.example/show/720/index.m3u8", 720, 2_500_000],
		]);
		expect(master.renditions[0]).toMatchObject({
			type: "AUDIO",
			groupId: "aac",
			isDefault: true,
			url: "https://cdn.example/show/audio/en.m3u8",
		});
	});
});

describe("chooseVariant", () => {
	const { variants } = parseMasterPlaylist(MASTER, BASE);

	it("takes the best with no preference", () => {
		expect(chooseVariant(variants)?.height).toBe(1080);
	});

	it("takes the tallest within the preferred quality", () => {
		expect(chooseVariant(variants, "720p")?.height).toBe(720);
		expect(chooseVariant(variants, "4K")?.height).toBe(1080);
	});

	it("takes the closest taller one when nothing fits", () => {
		expect(chooseVariant(variants, "480p")?.height).toBe(360);
		const tall = variants.filter((v) => (v.height ?? 0) >= 720);
		expect(chooseVariant(tall, "480p")?.height).toBe(720);
	});

	it("falls back to bandwidth without resolutions", () => {
		const bare = variants.map((v) => ({ ...v, height: null }));
		expect(chooseVariant(bare)?.bandwidth).toBe(5_000_000);
		expect(chooseVariant([])).toBeNull();
	});
});

describe("parseMasterPlaylist edge cases", () => {
	it("skips a variant with no URI and keeps muxed renditions address-less", () => {
		const master = parseMasterPlaylist(
			'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Main"\n#EXT-X-STREAM-INF:BANDWIDTH=1\n',
			BASE,
		);
		expect(master.variants).toEqual([]);
		expect(master.renditions[0]).toMatchObject({ url: null, language: null });
		const bare = parseMasterPlaylist("#EXT-X-MEDIA:\n", BASE);
		expect(bare.renditions[0]).toMatchObject({
			type: "",
			groupId: "",
			name: "",
		});
	});
});

describe("chooseAudio", () => {
	const master = parseMasterPlaylist(MASTER, BASE);

	it("picks the default rendition of the variant's audio group", () => {
		expect(chooseAudio(master, master.variants[0])?.language).toBe("en");
	});

	it("is null when audio is muxed into the variant", () => {
		const muxed = parseMasterPlaylist(fixture("hls-ts/master.m3u8"), BASE);
		expect(chooseAudio(muxed, muxed.variants[0])).toBeNull();
	});
});

describe("planMediaPlaylist", () => {
	it("plans an encrypted TS playlist: the key and every segment", () => {
		const plan = planMediaPlaylist(
			fixture("hls-ts/v/index.m3u8"),
			"https://cdn.example/show/v/index.m3u8",
		);
		expect(plan.files.map((f) => [f.name, f.url])).toEqual([
			["key-1.bin", "https://cdn.example/show/v/key.bin"],
			["seg-00001.ts", "https://cdn.example/show/v/seg00.ts"],
			["seg-00002.ts", "https://cdn.example/show/v/seg01.ts"],
			["seg-00003.ts", "https://cdn.example/show/v/seg02.ts"],
			["seg-00004.ts", "https://cdn.example/show/v/seg03.ts"],
		]);
		// The key keeps its method and IV, pointing at the local copy.
		expect(plan.playlist).toContain(
			'#EXT-X-KEY:METHOD=AES-128,URI="key-1.bin",IV=0x00000000000000000000000000000001',
		);
		expect(plan.playlist).not.toContain("seg00.ts");
		expect(plan.playlist).toContain("#EXT-X-ENDLIST");
		expect(plan.duration).toBeCloseTo(7.8);
	});

	it("plans an fMP4 playlist, initialisation segment first", () => {
		const plan = planMediaPlaylist(
			fixture("hls-fmp4/index.m3u8"),
			"https://cdn.example/f/index.m3u8",
			"video-",
		);
		expect(plan.files[0]).toEqual({
			name: "video-init-1.mp4",
			url: "https://cdn.example/f/init.mp4",
			range: null,
		});
		expect(plan.files.at(-1)?.name).toBe("video-seg-00004.m4s");
		expect(plan.playlist).toContain('#EXT-X-MAP:URI="video-init-1.mp4"');
	});

	it("turns byte-range segments into files of their own", () => {
		const plan = planMediaPlaylist(
			`#EXTM3U
#EXT-X-MAP:URI="main.mp4",BYTERANGE="700@0"
#EXTINF:4,
#EXT-X-BYTERANGE:1000@700
main.mp4
#EXTINF:4,
#EXT-X-BYTERANGE:500
main.mp4
#EXT-X-ENDLIST`,
			"https://cdn.example/r/index.m3u8",
		);
		expect(plan.files.map((f) => f.range)).toEqual([
			{ start: 0, end: 699 },
			{ start: 700, end: 1699 },
			{ start: 1700, end: 2199 },
		]);
		expect(plan.playlist).not.toContain("BYTERANGE");
	});

	it("starts an offset-less first range at byte 0", () => {
		const plan = planMediaPlaylist(
			"#EXTM3U\n#EXTINF:4,\n#EXT-X-BYTERANGE:100\nall.ts\n#EXT-X-ENDLIST",
			BASE,
		);
		expect(plan.files[0].range).toEqual({ start: 0, end: 99 });
	});

	it("refuses a live stream", () => {
		expect(() =>
			planMediaPlaylist("#EXTM3U\n#EXTINF:4,\nlive.ts\n", BASE),
		).toThrow(/live stream/);
	});

	it("refuses DRM", () => {
		for (const key of [
			'#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"',
			'#EXT-X-KEY:METHOD=AES-128,URI="k",KEYFORMAT="com.apple.streamingkeydelivery"',
		]) {
			expect(() =>
				planMediaPlaylist(
					`#EXTM3U\n${key}\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST`,
					BASE,
				),
			).toThrow(HlsDownloadError);
		}
	});

	it("keeps METHOD=NONE and refuses keys or maps with no address", () => {
		const cleared = planMediaPlaylist(
			"#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\na\n#EXT-X-ENDLIST",
			BASE,
		);
		expect(cleared.playlist).toContain("#EXT-X-KEY:METHOD=NONE");
		expect(cleared.files[0].name).toBe("seg-00001.ts");
		for (const tag of [
			"#EXT-X-KEY:METHOD=AES-128",
			'#EXT-X-MAP:BYTERANGE="1@0"',
		]) {
			expect(() =>
				planMediaPlaylist(
					`#EXTM3U\n${tag}\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST`,
					BASE,
				),
			).toThrow(/no address/);
		}
	});

	it("reads a ranged map and an unparseable duration", () => {
		const plan = planMediaPlaylist(
			'#EXTM3U\n#EXT-X-MAP:URI="init",BYTERANGE="10@5"\n#EXTINF:x,\nseg\n#EXT-X-ENDLIST',
			BASE,
		);
		expect(plan.files[0]).toMatchObject({
			name: "init-1.mp4",
			range: { start: 5, end: 14 },
		});
		expect(plan.duration).toBe(0);
	});

	it("refuses a master playlist and an empty one", () => {
		expect(() => planMediaPlaylist(MASTER, BASE)).toThrow(/master/);
		expect(() => planMediaPlaylist("#EXTM3U\n#EXT-X-ENDLIST", BASE)).toThrow(
			/no segments/,
		);
	});
});

describe("localMasterPlaylist", () => {
	const master = parseMasterPlaylist(MASTER, BASE);
	const variant = master.variants[1];

	it("keeps one variant and its separate audio, dropping subtitles", () => {
		const text = localMasterPlaylist(variant, "video.m3u8", {
			rendition: master.renditions[0],
			playlist: "audio.m3u8",
		});
		expect(text).toContain(
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"',
		);
		expect(text).toContain('AUDIO="audio"');
		expect(text).toContain('CODECS="avc1.640028,mp4a.40.2"');
		expect(text).not.toContain("SUBTITLES");
		expect(text.trim().split("\n").at(-1)).toBe("video.m3u8");
	});

	it("drops the audio group when audio is muxed", () => {
		expect(localMasterPlaylist(variant, "video.m3u8", null)).not.toContain(
			"AUDIO",
		);
	});
});
