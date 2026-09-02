import { dev } from "$app/env";

type Level = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const COLOR: Record<Level, string> = {
	debug: "\x1b[90m", // gray
	info: "\x1b[36m", // cyan
	warn: "\x1b[33m", // yellow
	error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const LEVEL_ORDER: Record<Level, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};
// Skip debug noise in prod; everything still prints to the container's stdout/stderr.
const MIN_LEVEL: Level = dev ? "debug" : "info";

function formatValue(value: unknown): string {
	if (value instanceof Error) {
		return value.stack ?? value.message;
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

function formatFields(fields: LogFields | undefined): string {
	if (!fields) {
		return "";
	}
	const entries = Object.entries(fields).map(
		([key, value]) => `${DIM}${key}=${RESET}${formatValue(value)}`,
	);
	return entries.length > 0 ? ` ${entries.join(" ")}` : "";
}

function write(level: Level, message: string, fields?: LogFields): void {
	if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) {
		return;
	}
	const time = new Date().toTimeString().slice(0, 8);
	const tag = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
	const line = `${DIM}${time}${RESET} ${tag} ${message}${formatFields(fields)}`;
	if (level === "error" || level === "warn") {
		// biome-ignore lint/suspicious/noConsole: this is the app's logger sink
		console.error(line);
		return;
	}
	// biome-ignore lint/suspicious/noConsole: this is the app's logger sink
	console.log(line);
}

/** Pretty, leveled console logger for server-side code. Colorized single-line
 * output : meant to be read straight off `docker logs` / a terminal, not
 * parsed by a log shipper. */
export const log = {
	debug: (message: string, fields?: LogFields) =>
		write("debug", message, fields),
	info: (message: string, fields?: LogFields) => write("info", message, fields),
	warn: (message: string, fields?: LogFields) => write("warn", message, fields),
	error: (message: string, fields?: LogFields) =>
		write("error", message, fields),
};
