import { onDestroy } from "svelte";

const CHANNEL_NAME = "nuvio-player-tabs";

/**
 * Multi-tab coherence for playback: when this tab's video starts playing, tell
 * every other open tab to pause theirs : mirrors the "only one tab plays at a
 * time" behaviour of every other streaming site, so opening a title in a new
 * tab doesn't leave two audio tracks running.
 */
export function createPlayerBroadcastSync(deps: {
	video: () => HTMLVideoElement | null;
	paused: () => boolean;
}): void {
	if (typeof BroadcastChannel === "undefined") {
		return;
	}
	const tabId = Math.random().toString(36).slice(2);
	const channel = new BroadcastChannel(CHANNEL_NAME);

	channel.onmessage = (event) => {
		if (event.data?.type === "playing" && event.data.tabId !== tabId) {
			deps.video()?.pause();
		}
	};

	$effect(() => {
		if (!deps.paused()) {
			channel.postMessage({ type: "playing", tabId });
		}
	});

	onDestroy(() => channel.close());
}
