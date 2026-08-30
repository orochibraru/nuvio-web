import { browser } from "$app/env";
import type { ResolvedStream } from "./stream-format.js";

const STORAGE_KEY = "nuvio:selected-stream";

export interface SelectedStream {
	videoId: string;
	url: string | null;
	externalUrl: string | null;
	notWebReady: boolean;
	label: string;
	addonName: string;
}

/**
 * Hands the stream chosen in the detail-page source sidebar to `/player/*` without
 * putting a long URL in the address bar. Kept in memory for the nav, mirrored to
 * sessionStorage so a player-page reload still resolves.
 */
class PlaybackHandoff {
	#current: SelectedStream | null = null;

	select(videoId: string, stream: ResolvedStream, label: string): void {
		const value: SelectedStream = {
			videoId,
			url: stream.url,
			externalUrl: stream.externalUrl,
			notWebReady: stream.notWebReady,
			label,
			addonName: stream.addonName,
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
