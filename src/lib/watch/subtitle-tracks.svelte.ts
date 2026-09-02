import { srtToVtt } from "./subtitles.ts";

interface TrackSource {
	key: string;
	url: string;
}

/**
 * Lazily turns addon subtitle URLs into WebVTT `blob:` URLs **in the browser** —
 * the file is fetched and converted client-side, never proxied through the
 * server. A track is only fetched when the viewer selects it (`resolve`), so a
 * title with 20 subtitle options costs 20 requests only if all 20 are opened.
 *
 * A fetch that fails (an addon host with no CORS headers, a dead link) marks the
 * track `failed` so the picker can grey it out instead of silently doing
 * nothing.
 */
export function createSubtitleTracks(tracks: () => TrackSource[]) {
	let ready = $state<Record<string, string>>({});
	let failed = $state<Record<string, true>>({});
	let objectUrls: string[] = [];

	function revokeAll() {
		for (const url of objectUrls) {
			URL.revokeObjectURL(url);
		}
		objectUrls = [];
	}

	$effect(() => {
		// New source / track list : drop the old blobs and start clean.
		void tracks();
		revokeAll();
		ready = {};
		failed = {};
		return revokeAll;
	});

	async function resolve(key: string): Promise<boolean> {
		if (ready[key]) {
			return true;
		}
		if (failed[key]) {
			return false;
		}
		const track = tracks().find((entry) => entry.key === key);
		if (!track) {
			return false;
		}
		try {
			const response = await fetch(track.url, {
				signal: AbortSignal.timeout(10_000),
			});
			if (!response.ok) {
				throw new Error(`subtitle fetch ${response.status}`);
			}
			const url = URL.createObjectURL(
				new Blob([srtToVtt(await response.text())], { type: "text/vtt" }),
			);
			objectUrls.push(url);
			ready = { ...ready, [key]: url };
			return true;
		} catch {
			failed = { ...failed, [key]: true };
			return false;
		}
	}

	return {
		/** `key → blob: URL` for tracks already fetched + converted. */
		get ready() {
			return ready;
		},
		/** `key → true` for tracks whose fetch failed (CORS / dead link). */
		get failed() {
			return failed;
		},
		resolve,
	};
}
