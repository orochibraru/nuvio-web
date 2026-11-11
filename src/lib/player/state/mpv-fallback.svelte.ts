import { untrack } from "svelte";
import {
	desktopEngine,
	desktopMpv,
	MPV_EVENT,
	type MpvEvent,
	type MpvRequest,
	mpvCanOpen,
} from "#lib/player/desktop-mpv.js";

type Status = "playing" | "closed" | "failed";

interface MpvFallbackDeps {
	url: () => string | null;
	/** What mpv is told about the source besides where it is. */
	request: () => Pick<MpvRequest, "title" | "headers" | "subtitles">;
	/** The source is known not to play in the web view: hand it over at once. */
	blocked: () => boolean;
	/** `start` is the resume position, not a guess that would overwrite it. */
	ready: () => boolean;
	start: () => number;
	/** A progress saver bound to the current video. */
	reporter: () => (position: number, duration: number) => void;
}

/**
 * The desktop app's mpv takes any source the web view can't decode,
 * hardware-decoded; its position comes back as `MPV_EVENT`s and is saved like
 * the in-app player's. Inert outside the desktop app.
 */
export function createMpvFallback(deps: MpvFallbackDeps) {
	const desktop = desktopMpv();
	// Preferred: mpv drawing under our own controls, in this window.
	const engine = desktopEngine();
	let session = $state<{
		url: string;
		status: Status;
		position: number;
		/** Playing in this window, under the page, rather than in mpv's own. */
		embedded: boolean;
	} | null>(null);
	const shown = $derived(
		session && deps.url() === session.url ? session : null,
	);

	function play(position: number) {
		const url = deps.url();
		if (!((engine || desktop) && mpvCanOpen(url))) {
			return;
		}
		const request = { ...deps.request(), url, start: position };
		session = { url, status: "playing", position, embedded: Boolean(engine) };
		if (engine) {
			engine.open(request);
		} else {
			desktop?.play(request);
		}
	}

	function stop() {
		if (session?.embedded) {
			engine?.close();
		} else {
			desktop?.stop();
		}
	}

	$effect(() => {
		const url = deps.url();
		if (
			(engine || desktop) &&
			mpvCanOpen(url) &&
			(deps.blocked() || engine?.always) &&
			deps.ready() &&
			session?.url !== url
		) {
			untrack(() => play(deps.start()));
		}
	});

	// mpv runs in its own window: it must not keep playing a source the viewer
	// left, by picking another or leaving the player.
	$effect(() => {
		if (session?.status === "playing" && deps.url() !== session.url) {
			stop();
			session = null;
		}
	});
	$effect(() => () => {
		if (untrack(() => session?.status) === "playing") {
			stop();
		}
	});

	$effect(() => {
		if (!(engine || desktop)) {
			return;
		}
		const report = deps.reporter();
		const onEvent = (event: Event) => {
			const detail = (event as CustomEvent<MpvEvent>).detail;
			if (!session) {
				return;
			}
			if (detail.duration > 0) {
				report(detail.position, detail.duration);
			}
			let status: Status = "playing";
			if (detail.type === "closed") {
				status = detail.failed ? "failed" : "closed";
			}
			session = { ...session, position: detail.position, status };
		};
		window.addEventListener(MPV_EVENT, onEvent);
		return () => window.removeEventListener(MPV_EVENT, onEvent);
	});

	return {
		/** Whether this runs in the desktop app with an mpv to hand sources to. */
		available: engine !== null || desktop !== null,
		/** The mpv session for the current source, while there is one. */
		get shown() {
			return shown;
		},
		play,
		/** Ends an in-window session: back to the page. */
		close: stop,
		engine,
	};
}
