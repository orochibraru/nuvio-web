import type { PlayerTransportState } from "./transport-state.svelte.ts";

/**
 * The two "react to a position in the timeline" concerns: showing (and
 * acting on) "Skip intro" while inside the intro window, and firing
 * `onOutro` once as playback crosses into the credits.
 */
export function createPlaybackMilestones(deps: {
	transport: PlayerTransportState;
	video: () => HTMLVideoElement | null;
	minimized: () => boolean;
	fatalError: () => boolean;
	introStart: () => number | null;
	introEnd: () => number | null;
	outroStart: () => number | null;
	onOutro?: () => void;
}) {
	let outroFired = false;

	const showSkipIntro = $derived(
		deps.introEnd() != null &&
			!deps.minimized() &&
			!deps.fatalError() &&
			deps.transport.currentTime >= (deps.introStart() ?? 0) &&
			deps.transport.currentTime < (deps.introEnd() as number) - 1,
	);

	function skipIntro() {
		const video = deps.video();
		const introEnd = deps.introEnd();
		if (video && introEnd != null) {
			video.currentTime = introEnd;
			void video.play();
		}
	}

	// Fire `onOutro` once as playback crosses into the credits.
	$effect(() => {
		const outroStart = deps.outroStart();
		if (
			!outroFired &&
			outroStart != null &&
			deps.transport.duration > 0 &&
			deps.transport.currentTime >= outroStart &&
			deps.transport.currentTime < deps.transport.duration - 0.5
		) {
			outroFired = true;
			deps.onOutro?.();
		}
	});

	// New source: the outro hasn't happened yet on it.
	function reset() {
		outroFired = false;
	}

	return {
		get showSkipIntro() {
			return showSkipIntro;
		},
		skipIntro,
		reset,
	};
}
