import { describe, expect, it } from "vitest";
import {
	externalPlayerHandoff,
	externalPlayerLink,
	isAndroid,
	isIos,
	magnetLink,
} from "./external-player.ts";

const ANDROID =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

// The URL from the bug report: a debrid link whose path carries base64 with
// its own `/` separators.
const DEBRID =
	"https://vortex.ombrage.space/api/debrid/eyJkZWJyaWRTZXJ2aWNlIjoic3RyZW10aHJ1In0/7abf965bb56e64d96235ca6b7c49b593d707c3a2/0";

describe("platform sniffing", () => {
	it("spots Android and iOS, and treats desktop as neither", () => {
		expect(isAndroid(ANDROID)).toBe(true);
		expect(isIos(IPHONE)).toBe(true);
		expect(isAndroid(MAC)).toBe(false);
		expect(isIos(MAC)).toBe(false);
		// Android tablets still say "Android"; an iPad says iPad on iOS 12-.
		expect(isAndroid(ANDROID.replace("Pixel 8", "SM-X700"))).toBe(true);
	});
});

describe("externalPlayerLink", () => {
	it("builds an Android Intent that asks the OS for a video app", () => {
		const link = externalPlayerLink("https://cdn.example/movie.mkv", ANDROID);
		expect(link).toBe(
			"intent://cdn.example/movie.mkv#Intent;scheme=https;action=android.intent.action.VIEW;type=video/*;end",
		);
	});

	it("keeps the query string but never the original scheme's colon", () => {
		const link = externalPlayerLink(
			"https://cdn.example/movie.mkv?token=abc%20def",
			ANDROID,
		);
		expect(link).toContain("intent://cdn.example/movie.mkv?token=abc%20def");
		expect(link).toContain(";scheme=https;");
		// The old bug: a bare `scheme://` + URL concat, which the URL parser
		// mangles into `https//`.
		expect(link).not.toContain("https//");
		expect(link).not.toContain("://https");
	});

	it("percent-encodes the whole URL into VLC's x-callback on iOS", () => {
		const link = externalPlayerLink("https://cdn.example/movie.mkv", IPHONE);
		expect(link).toBe(
			"vlc-x-callback://x-callback-url/stream?url=https%3A%2F%2Fcdn.example%2Fmovie.mkv",
		);
		// Round-trips back to exactly the stream URL.
		const url = new URL(link as string).searchParams.get("url");
		expect(url).toBe("https://cdn.example/movie.mkv");
	});

	it("survives a debrid URL whose path is full of slashes", () => {
		const android = externalPlayerLink(DEBRID, ANDROID);
		expect(android).toContain("intent://vortex.ombrage.space/api/debrid/");
		expect(android).not.toContain("https//");

		const ios = externalPlayerLink(DEBRID, IPHONE);
		expect(new URL(ios as string).searchParams.get("url")).toBe(DEBRID);
	});

	it("is null on desktop, where no scheme is reliably registered", () => {
		expect(externalPlayerLink("https://cdn.example/movie.mkv", MAC)).toBeNull();
	});

	it("is null for a magnet link or junk, on any platform", () => {
		expect(externalPlayerLink("magnet:?xt=urn:btih:abc", ANDROID)).toBeNull();
		expect(externalPlayerLink("not a url", ANDROID)).toBeNull();
		expect(externalPlayerLink("", ANDROID)).toBeNull();
		expect(externalPlayerLink(null, ANDROID)).toBeNull();
	});
});

describe("magnetLink", () => {
	const HASH = "7abf965bb56e64d96235ca6b7c49b593d707c3a2";

	it("builds a magnet from a 40-char info hash", () => {
		expect(magnetLink(HASH)).toBe(`magnet:?xt=urn:btih:${HASH}`);
	});

	it("lowercases the hash and attaches a display name", () => {
		expect(magnetLink(HASH.toUpperCase(), "The Movie 1080p")).toBe(
			`magnet:?xt=urn:btih:${HASH}&dn=The%20Movie%201080p`,
		);
	});

	it("accepts a base32 hash", () => {
		const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
		expect(magnetLink(b32)).toBe(`magnet:?xt=urn:btih:${b32.toLowerCase()}`);
	});

	it("rejects anything that isn't a hash", () => {
		expect(magnetLink(null)).toBeNull();
		expect(magnetLink("")).toBeNull();
		expect(magnetLink("not-a-hash")).toBeNull();
		expect(magnetLink(HASH.slice(0, 20))).toBeNull();
	});
});

describe("externalPlayerHandoff", () => {
	it("deep-links a direct URL on mobile", () => {
		expect(
			externalPlayerHandoff({ url: "https://cdn.example/m.mkv" }, ANDROID),
		).toMatchObject({ kind: "link" });
	});

	it("falls back to copying a direct URL on desktop", () => {
		expect(
			externalPlayerHandoff({ url: "https://cdn.example/m.mkv" }, MAC),
		).toEqual({ kind: "copy", url: "https://cdn.example/m.mkv" });
	});

	it("hands a P2P stream its magnet — on desktop too, where the OS has a torrent app", () => {
		const hash = "7abf965bb56e64d96235ca6b7c49b593d707c3a2";
		for (const ua of [MAC, ANDROID, IPHONE]) {
			expect(
				externalPlayerHandoff(
					{ url: null, infoHash: hash, name: "Movie 1080p" },
					ua,
				),
			).toEqual({
				kind: "link",
				href: `magnet:?xt=urn:btih:${hash}&dn=Movie%201080p`,
			});
		}
	});

	it("prefers a direct URL over the magnet when a stream has both", () => {
		const out = externalPlayerHandoff(
			{
				url: "https://cdn.example/m.mkv",
				infoHash: "7abf965bb56e64d96235ca6b7c49b593d707c3a2",
			},
			MAC,
		);
		expect(out).toEqual({ kind: "copy", url: "https://cdn.example/m.mkv" });
	});

	it("falls back to externalUrl when there's no direct url", () => {
		expect(
			externalPlayerHandoff(
				{ url: null, externalUrl: "https://cdn.example/m.mkv" },
				MAC,
			),
		).toEqual({ kind: "copy", url: "https://cdn.example/m.mkv" });
	});

	it("is null only when there is genuinely nothing to hand over", () => {
		expect(externalPlayerHandoff({}, MAC)).toBeNull();
		expect(
			externalPlayerHandoff({ url: null, infoHash: null }, ANDROID),
		).toBeNull();
	});
});
