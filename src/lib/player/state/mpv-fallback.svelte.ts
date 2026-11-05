import { untrack } from "svelte";
import {
	desktopMpv,
	MPV_EVENT,
	type MpvEvent,
} from "#lib/player/desktop-mpv.js";

type Status = "playing" | "closed" | "failed";

interface MpvFallbackDeps {
	url: () => string | null;
	title: () => string;
	/** The source is known not to play in the web view: hand it over at once. */
	blocked: () => boolean;
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
	const send = desktopMpv();
	let session = $state<{
		url: string;
		status: Status;
		position: number;
	} | null>(null);
	const shown = $derived(
		session && deps.url() === session.url ? session : null,
	);

	function play(position: number) {
		const url = deps.url();
		if (!(send && url)) {
			return;
		}
		session = { url, status: "playing", position };
		send({ url, title: deps.title(), start: position });
	}

	$effect(() => {
		const url = deps.url();
		if (send && url && deps.blocked() && session?.url !== url) {
			untrack(() => play(deps.start()));
		}
	});

	$effect(() => {
		if (!send) {
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
		available: send !== null,
		/** The mpv session for the current source, while there is one. */
		get shown() {
			return shown;
		},
		play,
	};
}
