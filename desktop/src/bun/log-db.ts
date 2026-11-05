import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import process from "node:process";

// Every launch's logs, in one SQLite file anyone can query while the app runs:
// the shell's own, the server's (its JSON lines), and the page's (console,
// failed loads, CSP refusals, media events, through the preload below).

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TEXT = 8000;

export type LogSource = "shell" | "server" | "page" | "mpv";

export interface LogDb {
	path: string;
	write: (
		source: LogSource,
		level: string,
		message: string,
		data?: unknown,
	) => void;
	/** Records each line of a stream: a JSON log line by its fields, anything else as `level`. */
	pipe: (stream: ReadableStream<Uint8Array>, level: string) => Promise<void>;
}

/**
 * The log file, in a folder of this user's own: on a shared /tmp another
 * user's would be unwritable, and stream links carry tokens, so it is private.
 * Logs are never worth not starting, so memory stands in when it can't open.
 */
function openFile(): { path: string; db: Database } {
	const user =
		typeof process.getuid === "function"
			? String(process.getuid())
			: userInfo().username;
	const dir = join(tmpdir(), `nuvio-web-desktop-${user}`);
	const path = join(dir, "logs.sqlite");
	try {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		chmodSync(dir, 0o700);
		const db = new Database(path, { create: true });
		chmodSync(path, 0o600);
		return { path, db };
	} catch {
		return { path: ":memory:", db: new Database(":memory:") };
	}
}

export function openLogDb(): LogDb {
	const { path, db } = openFile();
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA busy_timeout = 2000");
	db.run(`CREATE TABLE IF NOT EXISTS logs (
		id INTEGER PRIMARY KEY,
		run INTEGER NOT NULL,
		at TEXT NOT NULL,
		source TEXT NOT NULL,
		level TEXT NOT NULL,
		scope TEXT,
		message TEXT NOT NULL,
		data TEXT
	)`);
	db.run("CREATE INDEX IF NOT EXISTS logs_run ON logs (run, id)");
	db.query("DELETE FROM logs WHERE at < ?").run(
		new Date(Date.now() - KEEP_MS).toISOString(),
	);
	const run = Date.now();
	const insert = db.query(
		"INSERT INTO logs (run, at, source, level, scope, message, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
	);

	function record(entry: {
		source: LogSource;
		level: string;
		message: string;
		data?: unknown;
		scope?: string | null;
		at?: string;
	}) {
		// Logging never takes the app down: a write that fails (a full disk,
		// another instance holding the lock) is dropped, and the pipes reading
		// the server keep draining it.
		try {
			insert.run(
				run,
				entry.at ?? new Date().toISOString(),
				entry.source,
				entry.level,
				entry.scope ?? null,
				entry.message.slice(0, MAX_TEXT),
				entry.data === undefined
					? null
					: JSON.stringify(entry.data).slice(0, MAX_TEXT),
			);
		} catch {
			// dropped
		}
	}

	function recordLine(line: string, level: string) {
		if (!line.trim()) {
			return;
		}
		try {
			const {
				time,
				level: lineLevel,
				scope,
				message,
				...rest
			} = JSON.parse(line);
			record({
				source: "server",
				level: String(lineLevel ?? level),
				message: String(message ?? ""),
				data: Object.keys(rest).length > 0 ? rest : undefined,
				scope: scope ? String(scope) : null,
				at: typeof time === "string" ? time : undefined,
			});
		} catch {
			record({ source: "server", level, message: line });
		}
	}

	return {
		path,
		write: (source, level, message, data) =>
			record({ source, level, message, data }),
		pipe: async (stream, level) => {
			const decoder = new TextDecoder();
			let buffer = "";
			for await (const chunk of stream) {
				buffer += decoder.decode(chunk, { stream: true });
				let newline = buffer.indexOf("\n");
				while (newline >= 0) {
					recordLine(buffer.slice(0, newline), level);
					buffer = buffer.slice(newline + 1);
					newline = buffer.indexOf("\n");
				}
			}
			recordLine(buffer, level);
		},
	};
}

/**
 * Runs in the page before its own scripts and reports to the shell over
 * Electrobun's host-message bridge, as `{ nuvioLog: { level, message, data } }`.
 */
export const PAGE_LOGGER = `(() => {
	const send = (level, message, data) => {
		try {
			window.__electrobunSendToHost({ nuvioLog: { level, message: String(message), data: { url: location.href, ...data } } });
		} catch {}
	};
	const text = (args) => args.map((value) => {
		if (value instanceof Error) return value.stack || value.message;
		if (typeof value === "string") return value;
		try { return JSON.stringify(value); } catch { return String(value); }
	}).join(" ");
	for (const level of ["error", "warn", "info", "log"]) {
		const original = console[level];
		console[level] = (...args) => {
			send(level === "log" ? "info" : level, text(args));
			original.apply(console, args);
		};
	}
	addEventListener("error", (event) => {
		const target = event.target;
		if (target && target !== window && "src" in target) {
			send("error", "failed to load a " + target.tagName.toLowerCase(), {
				src: target.currentSrc || target.src,
				mediaError: target.error ? { code: target.error.code, message: target.error.message } : undefined,
			});
			return;
		}
		send("error", event.message, { file: event.filename, line: event.lineno, stack: event.error && event.error.stack });
	}, true);
	const answer = (target, name, label) => {
		const original = target && target[name];
		if (typeof original !== "function") return;
		target[name] = function (...args) {
			try {
				const result = original.apply(this, args);
				send("debug", label, { query: args[0], result });
				return result;
			} catch (error) {
				send("error", label + " threw", { query: args[0], error: String(error) });
				throw error;
			}
		};
	};
	answer(window.MediaSource, "isTypeSupported", "MSE isTypeSupported");
	answer(window.ManagedMediaSource, "isTypeSupported", "ManagedMSE isTypeSupported");
	answer(HTMLMediaElement.prototype, "canPlayType", "canPlayType");
	answer(window.MediaSource && MediaSource.prototype, "addSourceBuffer", "MSE addSourceBuffer");
	for (const name of ["pushState", "replaceState"]) {
		const original = history[name];
		history[name] = function (...args) {
			const result = original.apply(this, args);
			send("info", "route", { to: location.pathname + location.search });
			return result;
		};
	}
	addEventListener("popstate", () => send("info", "route", { to: location.pathname + location.search, back: true }));
	const pageFetch = window.fetch;
	window.fetch = async (input, init) => {
		const range = new Headers(init && init.headers).get("Range");
		const target = String(input instanceof Request ? input.url : input);
		if (!range) {
			const started = performance.now();
			return pageFetch(input, init).then((response) => {
				if (!response.ok) {
					send("warn", "fetch " + response.status, { target, ms: Math.round(performance.now() - started) });
				}
				return response;
			}, (error) => {
				send("error", "fetch failed", { target, error: String(error) });
				throw error;
			});
		}
		try {
			const response = await pageFetch(input, init);
			send("debug", "ranged fetch", {
				target, range, status: response.status, redirected: response.redirected,
				type: response.type, final: response.url,
				length: response.headers.get("content-length"),
			});
			return response;
		} catch (error) {
			send("error", "ranged fetch failed", { target, range, error: String(error) });
			throw error;
		}
	};
	addEventListener("unhandledrejection", (event) => send("error", "unhandled rejection: " + text([event.reason])));
	document.addEventListener("securitypolicyviolation", (event) => {
		send("error", "CSP blocked " + event.blockedURI, { directive: event.violatedDirective });
	});
	for (const type of ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "play", "pause", "waiting", "stalled", "seeking", "seeked", "ended", "abort", "emptied", "error"]) {
		document.addEventListener(type, (event) => {
			const media = event.target;
			if (!(media instanceof HTMLMediaElement)) return;
			send("debug", "media " + type, {
				src: media.currentSrc,
				readyState: media.readyState,
				networkState: media.networkState,
				error: media.error ? { code: media.error.code, message: media.error.message } : undefined,
			});
		}, true);
	}
})();`;
