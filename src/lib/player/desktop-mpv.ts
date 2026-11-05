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
		nuvioDesktop?: { mpv?: (request: MpvRequest) => void };
	}
}

export function desktopMpv(): ((request: MpvRequest) => void) | null {
	return typeof window === "undefined"
		? null
		: (window.nuvioDesktop?.mpv ?? null);
}
