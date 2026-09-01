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
