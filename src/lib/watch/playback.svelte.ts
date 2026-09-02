import { browser } from "$app/env";
import {
	audioSupport,
	type ResolvedStream,
	riskyVideoCodec,
	videoSupport,
} from "./stream-format.ts";

const STORAGE_KEY = "nuvio:selected-stream";

export interface SelectedStream {
	videoId: string;
	url: string | null;
	externalUrl: string | null;
	notWebReady: boolean;
	label: string;
	addonName: string;
	/** Torrent info hash, when this is a P2P stream — the player builds the
	 *  `magnet:` handoff from it, since there's no http url to hand over. */
	infoHash: string | null;
	/** The label hints at an audio codec the browser probably can't decode. */
	audioRisky: boolean;
	/** The label hints at a video codec the browser probably can't decode. */
	videoRisky: boolean;
	/** The `stream-format` video-codec label (HEVC / AV1 / …), for a real probe. */
	videoCodec: string | null;
}

/**
 * Hands the stream chosen in the detail-page source sidebar to `/player/*` without
 * putting a long URL in the address bar. Kept in memory for the nav, mirrored to
 * sessionStorage so a player-page reload still resolves.
 */
class PlaybackHandoff {
	#current = $state<SelectedStream | null>(null);

	select(videoId: string, stream: ResolvedStream, label: string): void {
		const value: SelectedStream = {
			videoId,
			url: stream.url,
			externalUrl: stream.externalUrl,
			notWebReady: stream.notWebReady,
			label,
			addonName: stream.addonName,
			infoHash: stream.infoHash,
			audioRisky: audioSupport(stream) === "risky",
			videoRisky: videoSupport(stream) === "risky",
			videoCodec: riskyVideoCodec(stream),
		};
		this.#current = value;
		if (browser) {
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
			} catch {
				// storage unavailable — in-memory handoff still covers the common nav
			}
		}
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
					if (parsed.videoId === videoId) {
						this.#current = parsed;
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
// "Reuse last link" — persist the URL that actually played for a videoId so a
// re-watch (`reuseLastLink` setting) can skip re-resolution. Debrid links
// expire, so entries carry a timestamp and callers pass a max age.

const LINK_CACHE_KEY = "nuvio:last-links";
const MAX_ENTRIES = 60;

interface CachedLink extends SelectedStream {
	resolvedAt: number;
}

function readCache(): Record<string, CachedLink> {
	if (!browser) {
		return {};
	}
	try {
		return JSON.parse(localStorage.getItem(LINK_CACHE_KEY) ?? "{}");
	} catch {
		return {};
	}
}

function writeCache(map: Record<string, CachedLink>): void {
	try {
		const entries = Object.entries(map).sort(
			(a, b) => b[1].resolvedAt - a[1].resolvedAt,
		);
		localStorage.setItem(
			LINK_CACHE_KEY,
			JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))),
		);
	} catch {
		// storage full / unavailable — reuse just won't kick in
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

/** Drop a remembered link — call when it turns out to be dead. */
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
