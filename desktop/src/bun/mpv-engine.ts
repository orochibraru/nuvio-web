import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { PATHS } from "electrobun/main";
import type { MpvEvent, MpvRequest } from "./mpv.ts";

// libmpv drawing in the app's own window, under the page (native/macos): the
// web player's controls drive it, and its state goes back to the page.

/** What the page sees four times a second, as `nuvio:engine` on `window`. */
export interface EngineState {
	position: number;
	duration: number;
	paused: boolean;
	buffering: boolean;
	ended: boolean;
	volume: number;
	muted: boolean;
}

/** What the page may ask of the engine. Anything else is refused. */
export type EngineCommand =
	| { op: "pause"; value: boolean }
	| { op: "seek"; position: number }
	| { op: "volume"; value: number }
	| { op: "mute"; value: boolean }
	| { op: "speed"; value: number };

interface EngineOptions {
	/** The native window to draw in, once it exists. */
	window: () => Pointer | null;
	onState: (state: EngineState) => void;
	onProgress: (event: MpvEvent) => void;
	log: (level: string, message: string, data?: unknown) => void;
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
			return finite(command.value)
				? { op: command.op, value: command.value }
				: null;
		case "seek":
			return finite(command.position)
				? { op: "seek", position: command.position }
				: null;
		default:
			return null;
	}
}

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
		this.#native.nuvio_mpv_set_visible(this.#player, 1);
		this.#native.nuvio_mpv_set(this.#player, text("pause"), text("no"));
		const result = this.#native.nuvio_mpv_load(
			this.#player,
			text(request.url),
			request.start,
		);
		this.#log(result < 0 ? "error" : "info", "mpv engine loading", {
			url: request.url,
			start: request.start,
			result,
		});
		if (result < 0) {
			this.#fail(this.#player, request.start);
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
				set("volume", String(Math.min(100, Math.max(0, command.value * 100))));
				break;
			case "mute":
				set("mute", command.value ? "yes" : "no");
				break;
			case "speed":
				set("speed", String(Math.min(4, Math.max(0.25, command.value))));
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
		};
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
