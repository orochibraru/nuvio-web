import { browserDecodesDolby } from "#lib/player/codec-support.js";
import { browser } from "$app/env";
import {
	audioSupport,
	type ResolvedStream,
	riskyVideoCodec,
	videoSupport,
} from "./stream-format.ts";

/** The label names an audio codec this browser won't decode (Dolby is fine in WebKit). */
export function audioRiskyHere(stream: ResolvedStream): boolean {
	return audioSupport(stream, browserDecodesDolby()) === "risky";
}

const STORAGE_KEY = "nuvio:selected-stream";

export interface SelectedStream {
	videoId: string;
	url: string | null;
	externalUrl: string | null;
	notWebReady: boolean;
	label: string;
	addonName: string;
	/** Torrent info hash, when this is a P2P stream : the player builds the
	 *  `magnet:` handoff from it, since there's no http url to hand over. */
	infoHash: string | null;
	/** The label hints at an audio codec the browser probably can't decode. */
	audioRisky: boolean;
	/** The label hints at a video codec the browser probably can't decode. */
	videoRisky: boolean;
	/** The `stream-format` video-codec label (HEVC / AV1 / …), for a real probe. */
	videoCodec: string | null;
	/** The addon's release name across episodes; absent on links saved before it. */
	bingeGroup?: string | null;
}

/**
 * Hands the stream chosen in the detail-page source sidebar to `/player/*` without
 * putting a long URL in the address bar. Kept in memory for the nav, mirrored to
 * sessionStorage so a player-page reload still resolves.
 */
class PlaybackHandoff {
	#current = $state<SelectedStream | null>(null);

	/** Returns the key the player URL names the pick by (see `rememberPick`). */
	select(videoId: string, stream: ResolvedStream, label: string): string {
		const value: SelectedStream = {
			videoId,
			url: stream.url,
			externalUrl: stream.externalUrl,
			notWebReady: stream.notWebReady,
			label,
			addonName: stream.addonName,
			infoHash: stream.infoHash,
			audioRisky: audioRiskyHere(stream),
			videoRisky: videoSupport(stream) === "risky",
			videoCodec: riskyVideoCodec(stream),
			bingeGroup: stream.bingeGroup,
		};
		this.#current = value;
		if (browser) {
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
			} catch {
				// storage unavailable : in-memory handoff still covers the common nav
			}
		}
		return rememberPick(value);
	}

	/** The pick made in this page's lifetime, not one read back from storage. */
	fresh(videoId: string): SelectedStream | null {
		return this.#current?.videoId === videoId ? this.#current : null;
	}

	take(videoId: string): SelectedStream | null {
		if (this.#current?.videoId === videoId) {
			return this.#current;
		}
		if (browser) {
			try {
				const raw = sessionStorage.getItem(STORAGE_KEY);
				if (raw) {
					const parsed = JSON.parse(raw) as SelectedStream;
					// Read-only on purpose: the player calls this inside a
					// `$derived`, where writing `#current` throws
					// `state_unsafe_mutation`. Re-reading storage is cheap.
					if (parsed.videoId === videoId) {
						return parsed;
					}
				}
			} catch {
				// ignore
			}
		}
		return null;
	}

	clear(): void {
		this.#current = null;
		if (browser) {
			try {
				sessionStorage.removeItem(STORAGE_KEY);
			} catch {
				// ignore
			}
		}
	}
}

export const playbackHandoff = new PlaybackHandoff();

// ---------------------------------------------------------------------------
// "Reuse last link" : persist the URL that actually played for a videoId so a
// re-watch (`reuseLastLink` setting) can skip re-resolution. Debrid links
// expire, so entries carry a timestamp and callers pass a max age.

const LINK_CACHE_KEY = "nuvio:last-links";
const MAX_ENTRIES = 60;

interface CachedLink extends SelectedStream {
	resolvedAt: number;
}

function readCache(storageKey = LINK_CACHE_KEY): Record<string, CachedLink> {
	if (!browser) {
		return {};
	}
	try {
		return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
	} catch {
		return {};
	}
}

function writeCache(
	map: Record<string, CachedLink>,
	storageKey = LINK_CACHE_KEY,
): void {
	try {
		const entries = Object.entries(map).sort(
			(a, b) => b[1].resolvedAt - a[1].resolvedAt,
		);
		localStorage.setItem(
			storageKey,
			JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))),
		);
	} catch {
		// storage full / unavailable : reuse just won't kick in
	}
}

/** Remember the stream that's currently playing for `videoId`. */
export function rememberLink(stream: SelectedStream): void {
	if (!(browser && stream.url)) {
		return;
	}
	const map = readCache();
	map[stream.videoId] = { ...stream, resolvedAt: Date.now() };
	writeCache(map);
}

/** The remembered stream for `videoId`, if it's newer than `maxAgeDays`. */
export function recallLink(
	videoId: string,
	maxAgeDays: number,
): SelectedStream | null {
	const entry = readCache()[videoId];
	if (!entry?.url) {
		return null;
	}
	if (Date.now() - entry.resolvedAt > maxAgeDays * 86_400_000) {
		return null;
	}
	const { resolvedAt: _resolvedAt, ...stream } = entry;
	return stream;
}

/** Drop a remembered link : call when it turns out to be dead. */
export function forgetLink(videoId: string): void {
	if (!browser) {
		return;
	}
	const map = readCache();
	if (map[videoId]) {
		delete map[videoId];
		writeCache(map);
	}
}

// ---------------------------------------------------------------------------
// The stream a player URL points at : `?stream=<key>` names it, this browser
// holds the link. The key is a hash, so a debrid URL never reaches the address
// bar, the history, or whoever the page link is pasted to.

const PICKS_KEY = "nuvio:picked-streams";

/** A short, stable name for a stream : FNV-1a of its URL, else its info hash. */
export function streamKey(stream: {
	url: string | null;
	infoHash: string | null;
}): string {
	const text = stream.url ?? stream.infoHash ?? "";
	let hash = 0x81_1c_9d_c5;
	for (let index = 0; index < text.length; index++) {
		hash = Math.imul(hash ^ text.charCodeAt(index), 0x01_00_01_93);
	}
	return (hash >>> 0).toString(36);
}

/** Store the stream a player URL is about to name. Returns its key. */
export function rememberPick(stream: SelectedStream): string {
	const key = streamKey(stream);
	if (browser) {
		const map = readCache(PICKS_KEY);
		map[key] = { ...stream, resolvedAt: Date.now() };
		writeCache(map, PICKS_KEY);
	}
	return key;
}

/** The stream `key` names for `videoId`, if this browser has it and it's fresh. */
export function recallPick(
	videoId: string,
	key: string | null,
	maxAgeDays: number,
): SelectedStream | null {
	const entry = key ? readCache(PICKS_KEY)[key] : undefined;
	if (
		!entry ||
		entry.videoId !== videoId ||
		Date.now() - entry.resolvedAt > maxAgeDays * 86_400_000
	) {
		return null;
	}
	const { resolvedAt: _resolvedAt, ...stream } = entry;
	return stream;
}
