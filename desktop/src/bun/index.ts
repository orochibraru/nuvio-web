import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import process from "node:process";
import Electrobun, {
	ApplicationMenu,
	BrowserWindow,
	PATHS,
	Utils,
} from "electrobun/main";
import root from "../../../package.json" with { type: "json" };
import { openLogDb, PAGE_LOGGER } from "./log-db.ts";
import { findMpv, MpvPlayer, parseMpvRequest } from "./mpv.ts";

// Nuvio Web's own server, run on loopback with its data in the user's app-data
// folder, and a window that waits for it. Signing in goes to the official Nuvio
// server or any other backend the user names.

const HOST = "127.0.0.1";
// A listener only ever opened to test a port, never read from.
const PROBE = { data: () => undefined };
const STARTUP_TIMEOUT_MS = 30_000;

const dataDir = join(Utils.paths.userData, "data");
mkdirSync(dataDir, { recursive: true });
const logs = openLogDb();

function readText(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

/** True when nothing else holds `port` on loopback. */
function isFree(port: number): boolean {
	try {
		Bun.listen({ hostname: HOST, port, socket: PROBE }).stop(true);
		return true;
	} catch {
		return false;
	}
}

/**
 * The same port every launch: cookies, IndexedDB and the service worker are
 * keyed by origin, so a new port is a signed-out, empty app.
 */
function stablePort(): number {
	const file = join(Utils.paths.userData, "port");
	const saved = Number.parseInt(readText(file), 10);
	if (Number.isInteger(saved) && isFree(saved)) {
		return saved;
	}
	const probe = Bun.listen({ hostname: HOST, port: 0, socket: PROBE });
	const port = probe.port;
	probe.stop(true);
	writeFileSync(file, String(port));
	return port;
}

const origin = `http://${HOST}:${stablePort()}`;

function page(message: string): string {
	const text = message.replace(
		/[&<>"]/g,
		(character) => `&#${character.charCodeAt(0)};`,
	);
	return `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#a3a3a3;font:14px system-ui">${text}</body>`;
}

logs.write("shell", "info", "Starting", {
	origin,
	dataDir,
	version: root.version,
	platform: process.platform,
	arch: process.arch,
	os: release(),
	bun: Bun.version,
});

const mpvBinary = findMpv();
logs.write(
	"shell",
	mpvBinary ? "info" : "warn",
	mpvBinary
		? "mpv found"
		: "No mpv: sources the web view can't decode won't play",
	{ mpvBinary },
);

// The page asks for mpv through this; it only exists when there is one.
const MPV_BRIDGE = `window.nuvioDesktop = {
	mpv: (request) => window.__electrobunSendToHost({ nuvioMpv: request }),
	stopMpv: () => window.__electrobunSendToHost({ nuvioMpvStop: true }),
};`;

const window = new BrowserWindow({
	title: "Nuvio Web",
	html: page("Starting…"),
	frame: { width: 1280, height: 800 },
	preload: mpvBinary ? `${PAGE_LOGGER}\n${MPV_BRIDGE}` : PAGE_LOGGER,
});

const mpv = mpvBinary
	? new MpvPlayer(
			mpvBinary,
			(event) =>
				window.webview.executeJavascript(
					`window.dispatchEvent(new CustomEvent("nuvio:mpv", { detail: ${JSON.stringify(event)} }))`,
				),
			(level, message, data) => logs.write("mpv", level, message, data),
		)
	: null;

Electrobun.events.on("host-message", (event) => {
	const detail = (event as { data?: { detail?: unknown } }).data?.detail;
	if ((detail as { nuvioMpvStop?: unknown } | undefined)?.nuvioMpvStop) {
		mpv?.stop();
		return;
	}
	const mpvRequest = (detail as { nuvioMpv?: unknown } | undefined)?.nuvioMpv;
	if (mpvRequest !== undefined) {
		const request = parseMpvRequest(mpvRequest);
		if (request && mpv) {
			mpv.play(request);
		} else {
			logs.write("shell", "warn", "Refused an mpv request", { mpvRequest });
		}
		return;
	}
	const entry = (detail as { nuvioLog?: Record<string, unknown> } | undefined)
		?.nuvioLog;
	if (entry) {
		logs.write(
			"page",
			String(entry.level ?? "info"),
			String(entry.message ?? ""),
			entry.data,
		);
	}
});

// Only the app's own pages load in the window; any other link (a provider, an
// addon's page, `vlc://`) goes to the system's browser or app.
window.webview.setNavigationRules(["^*", `${origin}/*`]);
for (const name of ["did-navigate", "dom-ready"] as const) {
	window.webview.on(name, (event) => {
		logs.write("shell", "debug", name, {
			detail: (event as { data?: { detail?: unknown } }).data?.detail,
		});
	});
}
// What the system may open for a link: the web, mail, and the video players
// the app hands streams to. Anything else (file:, custom app schemes a page
// could aim at) stays shut.
const OUTSIDE_SCHEMES = new Set([
	"http:",
	"https:",
	"mailto:",
	"vlc:",
	"vlc-x-callback:",
	"infuse:",
	"outplayer:",
	"open-vidhub:",
	"iina:",
]);

function openOutside(raw: string) {
	let scheme: string;
	try {
		scheme = new URL(raw).protocol;
	} catch {
		logs.write("shell", "warn", "Refused to open a malformed link", {
			url: raw,
		});
		return;
	}
	if (!OUTSIDE_SCHEMES.has(scheme)) {
		logs.write("shell", "warn", "Refused to open a link", { url: raw, scheme });
		return;
	}
	logs.write("shell", "info", "Opened outside the app", { url: raw });
	Utils.openExternal(raw);
}

window.webview.on("will-navigate", (event) => {
	const detail = (event as { data?: { detail?: string } }).data?.detail ?? "";
	try {
		const { url, allowed } = JSON.parse(detail) as {
			url?: string;
			allowed?: boolean;
		};
		if (url && allowed === false && url !== "about:blank") {
			openOutside(url);
		}
	} catch {
		// not a navigation we can act on
	}
});
Electrobun.events.on("new-window-open", (event) => {
	const detail = (event as { data?: { detail?: unknown } }).data?.detail;
	const url =
		typeof detail === "string"
			? detail
			: (detail as { url?: string } | undefined)?.url;
	if (url) {
		openOutside(url);
	}
});

ApplicationMenu.setApplicationMenu([
	{
		label: "Nuvio Web",
		submenu: [{ role: "hide" }, { role: "quit" }],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
	{
		label: "View",
		submenu: [{ label: "Reload", action: "reload", accelerator: "r" }],
	},
]);
ApplicationMenu.on("application-menu-clicked", (event) => {
	if ((event as { data?: { action?: string } }).data?.action === "reload") {
		window.webview.executeJavascript("location.reload()");
	}
});

const server = Bun.spawn(
	[
		join(
			PATHS.RESOURCES_FOLDER,
			"app",
			"server",
			process.platform === "win32" ? "server.exe" : "server",
		),
	],
	{
		env: {
			...process.env,
			HOST,
			PORT: new URL(origin).port,
			NUVIO_DATA_DIR: dataDir,
			// A personal app: users pick their own backend at sign-in.
			NUVIO_ALLOW_CUSTOM_BACKENDS: "true",
			NUVIO_LOG_FORMAT: "json",
			// Everything into the log database unless the user says otherwise.
			NUVIO_LOG_LEVEL: process.env.NUVIO_LOG_LEVEL ?? "debug",
			SHUTDOWN_TIMEOUT: "8",
		},
		stdout: "pipe",
		stderr: "pipe",
	},
);
void logs.pipe(server.stdout, "info");
void logs.pipe(server.stderr, "error");

let quitting = false;
Electrobun.events.on("before-quit", () => {
	quitting = true;
	logs.write("shell", "info", "Quitting");
	mpv?.stop();
	server.kill("SIGTERM");
});

server.exited.then((code) => {
	logs.write("shell", quitting ? "info" : "error", "Server exited", { code });
	if (!quitting) {
		window.webview.loadHTML(
			page(`The server stopped (exit ${code}). Logs: ${logs.path}`),
		);
	}
});

async function healthy(): Promise<boolean> {
	try {
		return (await fetch(`${origin}/api/health`)).ok;
	} catch {
		return false;
	}
}

const deadline = Date.now() + STARTUP_TIMEOUT_MS;
// biome-ignore lint/performance/noAwaitInLoops: polling, one request at a time
while (!(await healthy()) && Date.now() < deadline && !quitting) {
	await Bun.sleep(150);
}
if (await healthy()) {
	logs.write("shell", "info", "Server up");
	window.webview.loadURL(`${origin}/`);
} else if (!quitting) {
	logs.write("shell", "error", "Server didn't start in time");
	window.webview.loadHTML(page(`The server didn't start. Logs: ${logs.path}`));
}
