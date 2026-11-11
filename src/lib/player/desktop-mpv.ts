import { languageKey } from "./audio-language.ts";

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
	/** What the stream's host wants sent (the addon's `proxyHeaders`). */
	headers?: Record<string, string>;
	/** Addon subtitle URLs for mpv to load beside the video. */
	subtitles?: string[];
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

/** One of the file's audio or subtitle tracks, from mpv's `track-list`. */
export interface EngineTrack {
	id: number;
	type: "audio" | "sub";
	/** The file's language tag, or "". */
	lang: string;
	title: string;
	selected: boolean;
	/** The URL a subtitle was added from (`sub-add`), else null. */
	external: string | null;
}

/** mpv drawing under the page, in the app's window: its state, four times a second. */
export interface EngineState {
	position: number;
	duration: number;
	paused: boolean;
	buffering: boolean;
	ended: boolean;
	/** 0 to 3: past 1 is the boost. */
	volume: number;
	muted: boolean;
	tracks: EngineTrack[];
}

export type EngineCommand =
	| { op: "pause"; value: boolean }
	| { op: "seek"; position: number }
	| { op: "volume"; value: number }
	| { op: "mute"; value: boolean }
	| { op: "speed"; value: number }
	| { op: "audio"; id: number }
	/** A track of the file's, or `null` for none. */
	| { op: "subtitle"; id: number | null }
	/** An addon subtitle: mpv fetches it, then shows it. */
	| { op: "subtitle-add"; url: string; lang: string }
	/** Seconds: positive shows them later. */
	| { op: "subtitle-delay"; value: number }
	| {
			op: "subtitle-style";
			size: "small" | "medium" | "large";
			color: string;
			background: boolean;
			outline: boolean;
	  };

export const ENGINE_EVENT = "nuvio:engine";

export interface DesktopEngine {
	open: (request: MpvRequest) => void;
	command: (command: EngineCommand) => void;
	close: () => void;
	/** Every source plays in the engine (`NUVIO_MPV_ENGINE=always`), not only those the web view refuses. */
	always?: boolean;
}

declare global {
	interface Window {
		nuvioDesktop?: {
			mpv?: (request: MpvRequest) => void;
			stopMpv?: () => void;
			engine?: DesktopEngine;
			/** Shows the downloads folder in Finder / Explorer / the file manager. */
			openDownloads?: () => void;
			/** Asks for another downloads folder; the app restarts its server on it. */
			chooseDownloadsFolder?: () => void;
			/** Goes back to `defaultDownloadsFolder`. */
			resetDownloadsFolder?: () => void;
			defaultDownloadsFolder?: string;
		};
	}
}

export function insideDesktopApp(): boolean {
	return typeof window !== "undefined" && window.nuvioDesktop !== undefined;
}

/** The in-window engine, when the desktop app has one (macOS). */
export function desktopEngine(): DesktopEngine | null {
	return typeof window === "undefined"
		? null
		: (window.nuvioDesktop?.engine ?? null);
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

/**
 * Whether mpv can open `url` at all: the desktop app hands it http(s), and
 * `nuvio-download:<id>/<path>`, a download in its folder that it resolves to
 * the file itself (see `mpvDownloadUrl`).
 */
export function mpvCanOpen(url: string | null): url is string {
	return url !== null && /^(?:https?:\/\/|nuvio-download:)/i.test(url);
}

/**
 * The addon subtitles handed to mpv: the preferred language's first, since
 * the desktop app keeps only the first few (mpv fetches each before it plays).
 */
export function mpvSubtitles(
	options: readonly { lang: string; url: string }[],
	preferredLanguage: string,
): string[] {
	const wanted = languageKey(preferredLanguage);
	const preferred = (option: { lang: string }) =>
		wanted !== null && languageKey(option.lang) === wanted;
	return [
		...options.filter(preferred),
		...options.filter((option) => !preferred(option)),
	]
		.map((option) => option.url)
		.filter((url) => /^https?:\/\//i.test(url));
}
