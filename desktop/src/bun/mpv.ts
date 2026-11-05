import { existsSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { Subprocess } from "bun";
import { PATHS } from "electrobun/main";

// mpv for what the web view can't decode: hardware-decoded, in its own window,
// its position read back over its JSON IPC and reported to the page.

export interface MpvRequest {
	url: string;
	title: string;
	start: number;
}

export interface MpvEvent {
	type: "progress" | "closed";
	position: number;
	duration: number;
	ended?: boolean;
	failed?: boolean;
}

const SYSTEM_PATHS = [
	"/opt/homebrew/bin/mpv",
	"/usr/local/bin/mpv",
	"/usr/bin/mpv",
	"/Applications/mpv.app/Contents/MacOS/mpv",
];
const REPORT_EVERY_MS = 5000;
const CONNECT_TRIES = 50;
// mpv's exit status when no file could be played.
const EXIT_PLAYBACK_FAILED = 2;

/** The mpv bundled with the app, else one installed on the system, else null. */
export function findMpv(): string | null {
	const bundled =
		process.platform === "win32"
			? join(PATHS.RESOURCES_FOLDER, "app", "mpv", "mpv.exe")
			: join(
					PATHS.RESOURCES_FOLDER,
					"app",
					"mpv",
					"mpv.app",
					"Contents",
					"MacOS",
					"mpv",
				);
	if (existsSync(bundled)) {
		return bundled;
	}
	return (
		Bun.which("mpv") ?? SYSTEM_PATHS.find((path) => existsSync(path)) ?? null
	);
}

/** What the page asked for, if it is sane: an http(s) URL, a short title, a start in range. */
export function parseMpvRequest(value: unknown): MpvRequest | null {
	const request = value as Partial<MpvRequest> | null;
	if (!(request && typeof request.url === "string")) {
		return null;
	}
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}
	const start = Number(request.start);
	return {
		url: url.href,
		title: String(request.title ?? "").slice(0, 300),
		start: Number.isFinite(start) && start > 0 ? start : 0,
	};
}

type Log = (level: string, message: string, data?: unknown) => void;

export class MpvPlayer {
	readonly #binary: string;
	readonly #onEvent: (event: MpvEvent) => void;
	readonly #log: Log;
	#child: Subprocess | null = null;
	#socket: Socket | null = null;

	constructor(binary: string, onEvent: (event: MpvEvent) => void, log: Log) {
		this.#binary = binary;
		this.#onEvent = onEvent;
		this.#log = log;
	}

	play(request: MpvRequest) {
		this.stop();
		const ipc =
			process.platform === "win32"
				? `\\\\.\\pipe\\nuvio-mpv-${process.pid}-${Date.now()}`
				: join(tmpdir(), `nuvio-mpv-${process.pid}-${Date.now()}.sock`);
		const child = Bun.spawn(
			[
				this.#binary,
				"--hwdec=auto-safe",
				"--force-window=immediate",
				"--keep-open=no",
				"--idle=no",
				"--ytdl=no",
				"--save-position-on-quit=no",
				"--msg-level=all=warn",
				`--start=${request.start}`,
				`--force-media-title=${request.title}`,
				`--input-ipc-server=${ipc}`,
				"--",
				request.url,
			],
			{ stdout: "ignore", stderr: "pipe" },
		);
		this.#child = child;
		this.#log("info", "mpv started", {
			binary: this.#binary,
			url: request.url,
			start: request.start,
		});
		void this.#readErrors(child);

		const state = { position: request.start, duration: 0, ended: false };
		let lastReport = 0;
		// Events from an mpv already replaced or stopped would land on the
		// page's next session: only the current one reports.
		const current = () => this.#child === child;
		const report = (force = false) => {
			if (!current()) {
				return;
			}
			if (force || Date.now() - lastReport >= REPORT_EVERY_MS) {
				lastReport = Date.now();
				this.#onEvent({ type: "progress", ...state });
			}
		};
		void this.#watch(ipc, child, (name, data) => {
			if (name === "time-pos" && typeof data === "number") {
				state.position = data;
				report();
			} else if (name === "duration" && typeof data === "number") {
				state.duration = data;
			} else if (name === "pause") {
				report(true);
			} else if (name === "eof-reached" && data === true) {
				state.ended = true;
			}
		});

		void child.exited.then((code) => {
			const failed = code === EXIT_PLAYBACK_FAILED;
			this.#log(failed ? "error" : "info", "mpv exited", { code, ...state });
			if (!current()) {
				return;
			}
			this.#child = null;
			this.#socket?.destroy();
			this.#socket = null;
			this.#onEvent({ type: "closed", ...state, failed });
		});
	}

	stop() {
		this.#socket?.destroy();
		this.#socket = null;
		this.#child?.kill();
		this.#child = null;
	}

	async #readErrors(child: Subprocess) {
		const stderr = child.stderr;
		if (!(stderr && typeof stderr !== "number")) {
			return;
		}
		const text = await new Response(stderr).text();
		for (const line of text.split("\n")) {
			if (line.trim()) {
				this.#log("warn", line);
			}
		}
	}

	/** Connects to mpv's IPC once it is up and observes the properties progress needs. */
	async #watch(
		ipc: string,
		child: Subprocess,
		onChange: (name: string, data: unknown) => void,
	) {
		for (let attempt = 0; attempt < CONNECT_TRIES; attempt++) {
			if (this.#child !== child) {
				return;
			}
			// biome-ignore lint/performance/noAwaitInLoops: retrying until mpv's socket is up
			const socket = await new Promise<Socket | null>((resolve) => {
				const candidate = createConnection(ipc);
				candidate.once("connect", () => resolve(candidate));
				candidate.once("error", () => resolve(null));
			});
			if (socket) {
				this.#socket = socket;
				let buffer = "";
				socket.setEncoding("utf8");
				socket.on("data", (chunk: string) => {
					buffer += chunk;
					let newline = buffer.indexOf("\n");
					while (newline >= 0) {
						const line = buffer.slice(0, newline);
						buffer = buffer.slice(newline + 1);
						newline = buffer.indexOf("\n");
						try {
							const message = JSON.parse(line);
							if (message.event === "property-change") {
								onChange(message.name, message.data);
							}
						} catch {
							// not JSON: ignore
						}
					}
				});
				socket.on("error", () => undefined);
				for (const [id, name] of [
					"time-pos",
					"duration",
					"pause",
					"eof-reached",
				].entries()) {
					socket.write(
						`${JSON.stringify({ command: ["observe_property", id + 1, name] })}\n`,
					);
				}
				return;
			}
			await Bun.sleep(100);
		}
		this.#log("warn", "mpv IPC never came up", { ipc });
	}
}
