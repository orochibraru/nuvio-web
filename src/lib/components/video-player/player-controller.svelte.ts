import { createPlayerLoadLifecycle } from "./player-load-lifecycle.svelte.js";
import { createPlayerTransportActions } from "./player-transport-actions.svelte.js";
import { createPlayerTransportState } from "./player-transport-state.svelte.js";

/**
 * Wires the transport state, transport actions, and load-lifecycle pieces
 * together — see each of those for what they actually own. `state` is the
 * shared reactive object all three read and write (and the one `bind:`
 * targets in the caller's template point at); everything else is a plain
 * function, safe to spread into one flat object.
 */
export function createPlayerController(deps: {
	container: () => HTMLDivElement | null;
	video: () => HTMLVideoElement | null;
	src: () => string;
	startTime: () => number;
	panelOpen: () => boolean;
	onFatal: (message: string) => void;
	onEnded?: () => void;
}) {
	const state = createPlayerTransportState({ video: deps.video });
	const actions = createPlayerTransportActions({
		state,
		container: deps.container,
		video: deps.video,
		panelOpen: deps.panelOpen,
	});
	const lifecycle = createPlayerLoadLifecycle({
		state,
		video: deps.video,
		src: deps.src,
		startTime: deps.startTime,
		onFatal: deps.onFatal,
		onEnded: deps.onEnded,
	});

	return { state, ...actions, ...lifecycle };
}
