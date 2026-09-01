export interface PlayerTransportState {
	paused: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	muted: boolean;
	buffered: Array<{ start: number; end: number }>;
	rate: number;
	fullscreen: boolean;
	loading: boolean;
	ended: boolean;
	controlsVisible: boolean;
}

/**
 * The raw `<video>` transport state: the six properties bound two-way off
 * the element itself, plus the few extras that ride along with them. A
 * single reactive object, so `bind:paused={state.paused}` and friends just
 * work on it directly — no getter/setter boilerplate per field, and any
 * consumer holding a reference to `state` sees the same live values.
 */
export function createPlayerTransportState(deps: {
	video: () => HTMLVideoElement | null;
}): PlayerTransportState {
	const state = $state<PlayerTransportState>({
		paused: true,
		currentTime: 0,
		duration: 0,
		volume: 1,
		muted: false,
		buffered: [],
		rate: 1,
		fullscreen: false,
		loading: true,
		ended: false,
		controlsVisible: true,
	});

	$effect(() => {
		const video = deps.video();
		if (video) {
			video.playbackRate = state.rate;
		}
	});

	return state;
}
