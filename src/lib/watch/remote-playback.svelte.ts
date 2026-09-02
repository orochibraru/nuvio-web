import {
	promptForDevice,
	type RemotePlaybackState,
	type VideoWithRemote,
	watchRemotePlayback,
} from "./remote-playback.ts";

/**
 * Reactive "can I cast, and am I casting?" for the transport bar. Nothing to
 * configure and no SDK to load — see `remote-playback.ts` for which browser
 * API backs it. `available` stays false where neither exists (or where no
 * device is on the network), and the control row hides the button entirely.
 */
export function createRemotePlayback(deps: {
	video: () => HTMLVideoElement | null;
}) {
	let available = $state(false);
	let state = $state<RemotePlaybackState>("disconnected");

	$effect(() => {
		const el = deps.video() as VideoWithRemote | null;
		available = false;
		state = "disconnected";
		return watchRemotePlayback(el, (nextAvailable, nextState) => {
			available = nextAvailable;
			state = nextState;
		});
	});

	return {
		get available() {
			return available;
		},
		get connected() {
			return state === "connected";
		},
		get state() {
			return state;
		},
		/** Opens the browser's own device picker. Must be a user gesture. */
		prompt() {
			void promptForDevice(deps.video() as VideoWithRemote | null);
		},
	};
}
