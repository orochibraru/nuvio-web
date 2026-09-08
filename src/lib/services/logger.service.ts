export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "console" | "json";
export type LogFields = Record<string, unknown>;

export const LOG_LEVELS: readonly LogLevel[] = [
	"debug",
	"info",
	"warn",
	"error",
];
export const LOG_FORMATS: readonly LogFormat[] = ["console", "json"];

/** Where lines end up. Swapped for an array in tests. */
export interface LogSink {
	out: (line: string) => void;
	err: (line: string) => void;
}

export interface LoggerOptions {
	/**
	 * `console` is the colorized single-line form meant to be read straight off
	 * `docker logs`; `json` emits one object per line for a log shipper to
	 * parse. Set per instance from `NUVIO_LOG_FORMAT`, see `./server.ts`.
	 */
	format?: LogFormat;
	/** Subsystem name, printed as `[Hooks]` / carried as `scope` in JSON. */
	scope?: string;
}

const COLOR: Record<LogLevel, string> = {
	debug: "\x1b[90m", // gray
	info: "\x1b[36m", // cyan
	warn: "\x1b[33m", // yellow
	error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const MAGENTA = "\x1b[35m";

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
 * Leveled logger for server-side code. Warn and error go to the error sink so
 * they survive a `2>` split; everything else goes to the out sink.
 */
export class Logger {
	readonly #bound: LogFields;

	constructor(
		private readonly minLevel: LogLevel = "info",
		private readonly sink: LogSink = consoleSink,
		private readonly options: LoggerOptions = {},
		bound: LogFields = {},
	) {
		this.#bound = bound;
	}

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
		return new Logger(this.minLevel, this.sink, this.options, {
			...this.#bound,
			...fields,
		});
	}

	/** A logger tagged with a subsystem name : `logger.scoped("Hooks")`. */
	scoped(scope: string): Logger {
		return new Logger(
			this.minLevel,
			this.sink,
			{ ...this.options, scope },
			this.#bound,
		);
	}

	#write(level: LogLevel, message: string, fields?: LogFields): void {
		if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
			return;
		}
		const all = { ...this.#bound, ...fields };
		const line =
			this.options.format === "json"
				? formatJson(level, this.options.scope, message, all)
				: formatConsole(level, this.options.scope, message, all);
		if (level === "error" || level === "warn") {
			this.sink.err(line);
			return;
		}
		this.sink.out(line);
	}
}

function formatConsole(
	level: LogLevel,
	scope: string | undefined,
	message: string,
	fields: LogFields,
): string {
	const time = new Date().toTimeString().slice(0, 8);
	const tag = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
	const prefix = scope ? ` ${MAGENTA}[${scope}]${RESET}` : "";
	return `${DIM}${time}${RESET} ${tag}${prefix} ${message}${formatFields(fields)}`;
}

function formatJson(
	level: LogLevel,
	scope: string | undefined,
	message: string,
	fields: LogFields,
): string {
	// Errors are stringified through formatValue rather than left to
	// JSON.stringify, which turns an Error into `{}` and silently loses the
	// only part anyone reads.
	const serializable: LogFields = {};
	for (const [key, value] of Object.entries(fields)) {
		serializable[key] = value instanceof Error ? formatValue(value) : value;
	}
	return JSON.stringify({
		time: new Date().toISOString(),
		level,
		scope,
		message,
		...serializable,
	});
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
