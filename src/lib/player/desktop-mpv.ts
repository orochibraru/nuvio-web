/**
 * The desktop app's mpv: a stream the browser engine can't decode plays there,
 * hardware-decoded, and reports its position back. Present only inside the
 * desktop app, and only when it found an mpv to run.
 */
export interface MpvRequest {
	url: string;
	title: string;
	/** Seconds to start at. */
	start: number;
}

/** What the desktop app reports while mpv plays, as `MPV_EVENT` on `window`. */
export interface MpvEvent {
	type: "progress" | "closed";
	/** Seconds. */
	position: number;
	duration: number;
	/** On `closed`: mpv reached the end of the file. */
	ended?: boolean;
	/** On `closed`: mpv gave up on the source. */
	failed?: boolean;
}

export const MPV_EVENT = "nuvio:mpv";

declare global {
	interface Window {
		nuvioDesktop?: {
			mpv?: (request: MpvRequest) => void;
			stopMpv?: () => void;
		};
	}
}

export interface DesktopMpv {
	play: (request: MpvRequest) => void;
	stop: () => void;
}

export function desktopMpv(): DesktopMpv | null {
	const bridge =
		typeof window === "undefined" ? undefined : window.nuvioDesktop;
	const play = bridge?.mpv;
	if (!play) {
		return null;
	}
	return { play, stop: () => bridge.stopMpv?.() };
}

/** Whether mpv can open `url` at all: the desktop app only hands it http(s). */
export function mpvCanOpen(url: string | null): url is string {
	return url !== null && /^https?:\/\//i.test(url);
}
