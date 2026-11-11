import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { PATHS } from "electrobun/main";
import {
	type EngineCommand,
	type EngineState,
	type EngineTrack,
	parseTracks,
} from "./engine-command.ts";
import type { MpvEvent } from "./mpv.ts";
import type { MpvRequest } from "./mpv-request.ts";

// libmpv drawing in the app's own window, under the page (native/macos): the
// web player's controls drive it, and its state goes back to the page.

interface EngineOptions {
	/** The native window to draw in, once it exists. */
	window: () => Pointer | null;
	onState: (state: EngineState) => void;
	onProgress: (event: MpvEvent) => void;
	log: (level: string, message: string, data?: unknown) => void;
}

const SUBTITLE_SCALE = { small: 0.8, medium: 1, large: 1.3 } as const;
const MAX_VOLUME = 300;
const TRACK_LIST_BYTES = 256 * 1024;

const POLL_MS = 250;
const REPORT_EVERY_MS = 5000;

function library() {
	const path = join(
		PATHS.RESOURCES_FOLDER,
		"app",
		"native",
		"libnuvio-mpv.dylib",
	);
	if (process.platform !== "darwin" || !existsSync(path)) {
		return null;
	}
	return dlopen(path, {
		nuvio_mpv_create: { args: [FFIType.ptr], returns: FFIType.ptr },
		nuvio_mpv_load: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.f64],
			returns: FFIType.i32,
		},
		nuvio_mpv_set: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
		nuvio_mpv_command: {
			args: [FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
		nuvio_mpv_get_double: {
			args: [FFIType.ptr, FFIType.ptr],
			returns: FFIType.f64,
		},
		nuvio_mpv_get_flag: {
			args: [FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
		nuvio_mpv_get_string: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.i32],
			returns: FFIType.i32,
		},
		nuvio_mpv_set_visible: {
			args: [FFIType.ptr, FFIType.i32],
			returns: FFIType.void,
		},
		nuvio_mpv_poll_end: { args: [FFIType.ptr], returns: FFIType.i32 },
		nuvio_mpv_destroy: { args: [FFIType.ptr], returns: FFIType.void },
	}).symbols;
}

const text = (value: string) => Buffer.from(`${value}\0`);

export class MpvEngine {
	readonly #native: NonNullable<ReturnType<typeof library>>;
	readonly #window: () => Pointer | null;
	readonly #emitState: (state: EngineState) => void;
	readonly #emitProgress: (event: MpvEvent) => void;
	readonly #log: (level: string, message: string, data?: unknown) => void;
	#player: Pointer | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	readonly #trackBuffer = Buffer.alloc(TRACK_LIST_BYTES);
	#trackJson = "";
	#tracks: EngineTrack[] = [];

	/** The engine, or null where its library isn't bundled (not macOS). */
	static load(options: EngineOptions): MpvEngine | null {
		try {
			const native = library();
			return native ? new MpvEngine(native, options) : null;
		} catch (error) {
			// A library that won't load (a broken build, a missing system
			// framework) means no engine, not no app.
			options.log("error", "mpv engine library failed to load", {
				error: String(error),
			});
			return null;
		}
	}

	private constructor(
		native: NonNullable<ReturnType<typeof library>>,
		options: EngineOptions,
	) {
		this.#native = native;
		this.#window = options.window;
		this.#emitState = options.onState;
		this.#emitProgress = options.onProgress;
		this.#log = options.log;
	}

	open(request: MpvRequest) {
		if (!this.#player) {
			const window = this.#window();
			this.#player = window
				? (this.#native.nuvio_mpv_create(window) as Pointer | null)
				: null;
			if (!this.#player) {
				this.#log("error", "mpv engine could not attach to the window");
				this.#emitProgress({
					type: "closed",
					position: request.start,
					duration: 0,
					failed: true,
				});
				return;
			}
		}
		const player = this.#player;
		this.#native.nuvio_mpv_set_visible(player, 1);
		this.#native.nuvio_mpv_set(player, text("pause"), text("no"));
		this.#native.nuvio_mpv_set(
			player,
			text("volume-max"),
			text(String(MAX_VOLUME)),
		);
		this.#trackJson = "";
		this.#tracks = [];
		// One item per `append`, never split on commas; read at the next load.
		const list = (name: string, operation: string, value = "") =>
			this.#native.nuvio_mpv_command(
				player,
				text(["change-list", name, operation, value].join("\n")),
			);
		list("http-header-fields", "clr");
		list("sub-files", "clr");
		for (const field of request.headerFields) {
			list("http-header-fields", "append", field);
		}
		// Addon subtitles aren't preloaded: the page's picker adds the one
		// asked for (`subtitle-add`), so none delays the start.
		const result = this.#native.nuvio_mpv_load(
			player,
			text(request.url),
			request.start,
		);
		this.#log(result < 0 ? "error" : "info", "mpv engine loading", {
			url: request.url,
			start: request.start,
			headers: request.headerFields.length,
			subtitles: request.subtitles.length,
			result,
		});
		if (result < 0) {
			this.#fail(player, request.start);
			return;
		}
		this.#watch();
	}

	command(command: EngineCommand) {
		const player = this.#player;
		if (!player) {
			return;
		}
		const set = (name: string, value: string) =>
			this.#native.nuvio_mpv_set(player, text(name), text(value));
		switch (command.op) {
			case "pause":
				set("pause", command.value ? "yes" : "no");
				break;
			case "seek":
				this.#native.nuvio_mpv_command(
					player,
					text(`seek\n${Math.max(0, command.position)}\nabsolute+keyframes`),
				);
				break;
			case "volume":
				set(
					"volume",
					String(Math.min(MAX_VOLUME, Math.max(0, command.value * 100))),
				);
				break;
			case "mute":
				set("mute", command.value ? "yes" : "no");
				break;
			case "speed":
				set("speed", String(Math.min(4, Math.max(0.25, command.value))));
				break;
			default:
				this.#trackCommand(player, command);
				break;
		}
	}

	#trackCommand(player: Pointer, command: EngineCommand) {
		const set = (name: string, value: string) =>
			this.#native.nuvio_mpv_set(player, text(name), text(value));
		switch (command.op) {
			case "audio":
				set("aid", String(command.id));
				break;
			case "subtitle":
				set("sid", command.id === null ? "no" : String(command.id));
				break;
			case "subtitle-add": {
				const added = this.#tracks.find(
					(track) => track.type === "sub" && track.external === command.url,
				);
				if (added) {
					set("sid", String(added.id));
				} else {
					this.#native.nuvio_mpv_command(
						player,
						text(
							[
								"sub-add",
								command.url,
								"select",
								command.lang,
								command.lang,
							].join("\n"),
						),
					);
				}
				break;
			}
			case "subtitle-delay":
				set("sub-delay", String(Math.min(60, Math.max(-60, command.value))));
				break;
			case "subtitle-style":
				set("sub-scale", String(SUBTITLE_SCALE[command.size]));
				set("sub-color", command.color);
				set(
					"sub-border-style",
					command.background ? "background-box" : "outline-and-shadow",
				);
				set("sub-back-color", command.background ? "#99000000" : "#00000000");
				set(
					"sub-outline-size",
					command.outline || !command.background ? "3" : "0",
				);
				break;
			default:
				break;
		}
	}

	close() {
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
		const player = this.#player;
		if (player) {
			const state = this.#state(player);
			this.#native.nuvio_mpv_command(player, text("stop"));
			this.#native.nuvio_mpv_set_visible(player, 0);
			this.#emitProgress({ type: "closed", ...state });
		}
	}

	#state(player: Pointer) {
		const number = (name: string) => {
			const value = this.#native.nuvio_mpv_get_double(player, text(name));
			return Number.isFinite(value) ? value : 0;
		};
		const flag = (name: string) =>
			this.#native.nuvio_mpv_get_flag(player, text(name)) === 1;
		return {
			position: number("time-pos"),
			duration: number("duration"),
			paused: flag("pause"),
			buffering: flag("paused-for-cache") || flag("seeking"),
			ended: flag("eof-reached"),
			volume: number("volume") / 100,
			muted: flag("mute"),
			tracks: this.#readTracks(player),
		};
	}

	/** Parsed only when mpv's list changed: a new track, or another selected. */
	#readTracks(player: Pointer): EngineTrack[] {
		const length = this.#native.nuvio_mpv_get_string(
			player,
			text("track-list"),
			this.#trackBuffer,
			this.#trackBuffer.length,
		);
		if (length < 0 || length >= this.#trackBuffer.length) {
			return this.#tracks;
		}
		const json = this.#trackBuffer.toString("utf8", 0, length);
		if (json !== this.#trackJson) {
			this.#trackJson = json;
			this.#tracks = parseTracks(json);
		}
		return this.#tracks;
	}

	/** mpv gave up on the source: back to the page, which says so. */
	#fail(player: Pointer, position: number) {
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
		this.#native.nuvio_mpv_set_visible(player, 0);
		this.#emitProgress({ type: "closed", position, duration: 0, failed: true });
	}

	#watch() {
		if (this.#timer) {
			clearInterval(this.#timer);
		}
		let lastReport = 0;
		this.#timer = setInterval(() => {
			const player = this.#player;
			if (!player) {
				return;
			}
			const state = this.#state(player);
			if (this.#native.nuvio_mpv_poll_end(player) < 0) {
				this.#log("error", "mpv engine could not play the source", state);
				this.#fail(player, state.position);
				return;
			}
			this.#emitState(state);
			if (!state.paused && Date.now() - lastReport >= REPORT_EVERY_MS) {
				lastReport = Date.now();
				this.#emitProgress({ type: "progress", ...state });
			}
		}, POLL_MS);
	}
}
