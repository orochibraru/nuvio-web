/**
 * Owns the in-player info overlay's open/closed state: a deliberate toggle
 * (Info button, keyboard shortcut) opens it "sticky"; a genuine pause (not a
 * buffering stall, not the end of playback) surfaces it on its own after a
 * beat, and pulls it back down the moment playback resumes. Dismissing it
 * during a pause suppresses that auto-open until the next resume.
 */
export function createInfoOverlayController(deps: {
	hasInfo: () => boolean;
	minimized: () => boolean;
	fatalError: () => boolean;
	ended: () => boolean;
	loading: () => boolean;
	paused: () => boolean;
	currentTime: () => number;
	/** Fired whenever the overlay opens, sticky or auto : keep the transport up. */
	onOpen: () => void;
}) {
	let open = $state(false);
	let autoOpened = $state(false);
	let dismissed = false;

	function openSticky() {
		autoOpened = false;
		open = true;
		deps.onOpen();
	}

	function close() {
		open = false;
		autoOpened = false;
		if (deps.paused()) {
			dismissed = true;
		}
	}

	// Another panel (subtitles, settings) is taking over the frame : drop the
	// overlay without marking it "dismissed" (a pause-triggered auto-open can
	// still surface it again once that other panel closes).
	function closeSilently() {
		open = false;
		autoOpened = false;
	}

	function reset() {
		open = false;
		autoOpened = false;
		dismissed = false;
	}

	$effect(() => {
		if (
			!deps.hasInfo() ||
			deps.minimized() ||
			deps.fatalError() ||
			deps.ended() ||
			deps.loading()
		) {
			return;
		}
		if (!deps.paused()) {
			dismissed = false;
			if (autoOpened) {
				open = false;
				autoOpened = false;
			}
			return;
		}
		if (open || dismissed || deps.currentTime() < 1) {
			return;
		}
		const timer = setTimeout(() => {
			autoOpened = true;
			open = true;
			deps.onOpen();
		}, 700);
		return () => clearTimeout(timer);
	});

	return {
		get open() {
			return open;
		},
		get autoOpened() {
			return autoOpened;
		},
		openSticky,
		close,
		closeSilently,
		reset,
	};
}

export type InfoOverlayController = ReturnType<
	typeof createInfoOverlayController
>;
