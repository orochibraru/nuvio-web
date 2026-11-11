// What the page and the in-window engine say to each other, checked at the
// boundary: the page is web content, so nothing reaches mpv unparsed.

/** One of the file's audio or subtitle tracks, from mpv's `track-list`. */
export interface EngineTrack {
	id: number;
	type: "audio" | "sub";
	lang: string;
	title: string;
	selected: boolean;
	/** The URL a subtitle was added from, else null. */
	external: string | null;
}

/** What the page sees four times a second, as `nuvio:engine` on `window`. */
export interface EngineState {
	position: number;
	duration: number;
	paused: boolean;
	buffering: boolean;
	ended: boolean;
	volume: number;
	muted: boolean;
	tracks: EngineTrack[];
}

const SUBTITLE_SIZES = ["small", "medium", "large"] as const;

/** What the page may ask of the engine. Anything else is refused. */
export type EngineCommand =
	| { op: "pause"; value: boolean }
	| { op: "seek"; position: number }
	| { op: "volume"; value: number }
	| { op: "mute"; value: boolean }
	| { op: "speed"; value: number }
	| { op: "audio"; id: number }
	| { op: "subtitle"; id: number | null }
	| { op: "subtitle-add"; url: string; lang: string }
	| { op: "subtitle-delay"; value: number }
	| {
			op: "subtitle-style";
			size: (typeof SUBTITLE_SIZES)[number];
			color: string;
			background: boolean;
			outline: boolean;
	  };

/** mpv's `track-list` JSON, down to the audio and subtitle tracks. */
export function parseTracks(json: string): EngineTrack[] {
	let list: unknown;
	try {
		list = JSON.parse(json);
	} catch {
		return [];
	}
	if (!Array.isArray(list)) {
		return [];
	}
	return list.flatMap((entry: Record<string, unknown>) =>
		(entry.type === "audio" || entry.type === "sub") &&
		typeof entry.id === "number"
			? [
					{
						id: entry.id,
						type: entry.type,
						lang: typeof entry.lang === "string" ? entry.lang : "",
						title: typeof entry.title === "string" ? entry.title : "",
						selected: entry.selected === true,
						external:
							entry.external === true &&
							typeof entry["external-filename"] === "string"
								? entry["external-filename"]
								: null,
					},
				]
			: [],
	);
}

const trackId = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value > 0;

function subtitleAdd(command: Record<string, unknown>): EngineCommand | null {
	return typeof command.url === "string" &&
		command.url.length <= 4096 &&
		/^https?:\/\//i.test(command.url) &&
		!/[\n\0]/.test(command.url) &&
		typeof command.lang === "string" &&
		/^[A-Za-z0-9-]{0,35}$/.test(command.lang)
		? { op: "subtitle-add", url: command.url, lang: command.lang }
		: null;
}

function subtitleStyle(command: Record<string, unknown>): EngineCommand | null {
	return SUBTITLE_SIZES.includes(command.size as "small") &&
		typeof command.color === "string" &&
		/^#[0-9a-f]{6}$/i.test(command.color) &&
		typeof command.background === "boolean" &&
		typeof command.outline === "boolean"
		? {
				op: "subtitle-style",
				size: command.size as (typeof SUBTITLE_SIZES)[number],
				color: command.color,
				background: command.background,
				outline: command.outline,
			}
		: null;
}

/** A command from the page, if every field is there with the right type. */
export function parseEngineCommand(value: unknown): EngineCommand | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const command = value as Record<string, unknown>;
	const finite = (field: unknown): field is number =>
		typeof field === "number" && Number.isFinite(field);
	switch (command.op) {
		case "pause":
		case "mute":
			return typeof command.value === "boolean"
				? { op: command.op, value: command.value }
				: null;
		case "volume":
		case "speed":
		case "subtitle-delay":
			return finite(command.value)
				? { op: command.op, value: command.value }
				: null;
		case "seek":
			return finite(command.position)
				? { op: "seek", position: command.position }
				: null;
		case "audio":
			return trackId(command.id) ? { op: "audio", id: command.id } : null;
		case "subtitle":
			return command.id === null || trackId(command.id)
				? { op: "subtitle", id: command.id }
				: null;
		case "subtitle-add":
			return subtitleAdd(command);
		case "subtitle-style":
			return subtitleStyle(command);
		default:
			return null;
	}
}
