export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

/** Where lines end up. Swapped for an array in tests. */
export interface LogSink {
	out: (line: string) => void;
	err: (line: string) => void;
}

const COLOR: Record<LogLevel, string> = {
	debug: "\x1b[90m", // gray
	info: "\x1b[36m", // cyan
	warn: "\x1b[33m", // yellow
	error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export const consoleSink: LogSink = {
	out(line) {
		// biome-ignore lint/suspicious/noConsole: this is the app's logger sink
		console.log(line);
	},
	err(line) {
		// biome-ignore lint/suspicious/noConsole: this is the app's logger sink
		console.error(line);
	},
};

/**
 * Leveled console logger for server-side code. Colorized single-line output,
 * meant to be read straight off `docker logs`, not parsed by a log shipper.
 */
export class Logger {
	constructor(
		private readonly minLevel: LogLevel = "info",
		private readonly sink: LogSink = consoleSink,
	) {}

	debug(message: string, fields?: LogFields): void {
		this.#write("debug", message, fields);
	}

	info(message: string, fields?: LogFields): void {
		this.#write("info", message, fields);
	}

	warn(message: string, fields?: LogFields): void {
		this.#write("warn", message, fields);
	}

	error(message: string, fields?: LogFields): void {
		this.#write("error", message, fields);
	}

	/**
	 * A logger that stamps `fields` onto every line : e.g. one carrying the
	 * request's `errorId` so a handler doesn't repeat it at each call.
	 */
	with(fields: LogFields): Logger {
		return new BoundLogger(this.minLevel, this.sink, fields);
	}

	protected enabled(level: LogLevel): boolean {
		return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
	}

	protected format(
		level: LogLevel,
		message: string,
		fields: LogFields | undefined,
	): string {
		const time = new Date().toTimeString().slice(0, 8);
		const tag = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
		return `${DIM}${time}${RESET} ${tag} ${message}${formatFields(fields)}`;
	}

	#write(level: LogLevel, message: string, fields?: LogFields): void {
		if (!this.enabled(level)) {
			return;
		}
		const line = this.format(level, message, this.merge(fields));
		if (level === "error" || level === "warn") {
			this.sink.err(line);
			return;
		}
		this.sink.out(line);
	}

	protected merge(fields: LogFields | undefined): LogFields | undefined {
		return fields;
	}
}

class BoundLogger extends Logger {
	readonly #bound: LogFields;

	constructor(minLevel: LogLevel, sink: LogSink, bound: LogFields) {
		super(minLevel, sink);
		this.#bound = bound;
	}

	protected override merge(fields: LogFields | undefined): LogFields {
		return { ...this.#bound, ...fields };
	}
}

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
