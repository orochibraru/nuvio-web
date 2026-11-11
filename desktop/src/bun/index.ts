import {
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { release } from "node:os";
import { isAbsolute, join } from "node:path";
import process from "node:process";
import Electrobun, {
	ApplicationMenu,
	type ApplicationMenuItemConfig,
	BrowserWindow,
	PATHS,
	Utils,
} from "electrobun/main";
import root from "../../../package.json" with { type: "json" };
import { parseEngineCommand } from "./engine-command.ts";
import { openLogDb, PAGE_LOGGER } from "./log-db.ts";
import { findMpv, MpvPlayer } from "./mpv.ts";
import { MpvEngine } from "./mpv-engine.ts";
import { parseMpvRequest } from "./mpv-request.ts";
import { INTRO_MS, LEAVE_MS, LEAVE_SCRIPT, splash } from "./splash.ts";
import {
	installUpdate,
	offerDownloadedUpdate,
	watchForUpdates,
} from "./updater.ts";

// Nuvio Web's own server, run on loopback with its data in the user's app-data
// folder, and a window that waits for it. Signing in goes to the official Nuvio
// server or any other backend the user names.

const HOST = "127.0.0.1";
// A listener only ever opened to test a port, never read from.
const PROBE = { data: () => undefined };
const STARTUP_TIMEOUT_MS = 30_000;

const dataDir = join(Utils.paths.userData, "data");
mkdirSync(dataDir, { recursive: true });
// Downloads are files the user sees: ~/Movies on macOS, Videos on Windows,
// XDG_VIDEOS_DIR (else ~/Videos) on Linux, unless the user picked a folder.
const defaultDownloadsDir = join(Utils.paths.videos, "Nuvio Web");
const downloadsFolderFile = join(Utils.paths.userData, "downloads-folder");
const logs = openLogDb();

function readText(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

function isFolder(path: string): boolean {
	try {
		return isAbsolute(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

// A picked folder that is gone (a drive not plugged in) is never recreated.
const savedDownloadsDir = readText(downloadsFolderFile).trim();
let downloadsDir = isFolder(savedDownloadsDir)
	? savedDownloadsDir
	: defaultDownloadsDir;

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

// Copied into the bundle by electrobun.config.ts; the splash goes without it.
const logo = (() => {
	try {
		const bytes = readFileSync(
			join(PATHS.RESOURCES_FOLDER, "app", "logo.webp"),
		);
		return `data:image/webp;base64,${bytes.toString("base64")}`;
	} catch {
		return "";
	}
})();

let splashShownAt = Date.now();

function showSplash(message: string, failed = false) {
	window.webview.loadHTML(splash({ logo, message, failed }));
	splashShownAt = Date.now();
}

logs.write("shell", "info", "Starting", {
	origin,
	dataDir,
	downloadsDir,
	version: root.version,
	platform: process.platform,
	arch: process.arch,
	os: release(),
	bun: Bun.version,
});

const updateLog = (level: string, message: string, data?: unknown) =>
	logs.write("shell", level, message, data);
// An update gone wrong never keeps the app from starting.
await offerDownloadedUpdate(updateLog).catch((error) =>
	updateLog("error", "Installing the update failed", { error: String(error) }),
);

const mpvBinary = findMpv();
logs.write(
	"shell",
	mpvBinary ? "info" : "warn",
	mpvBinary
		? "mpv found"
		: "No mpv: sources the web view can't decode won't play",
	{ mpvBinary },
);

// Always there, so the page knows it runs in the app (no "Install app").
const DESKTOP_BRIDGE = `window.nuvioDesktop = {
	openDownloads: () => window.__electrobunSendToHost({ nuvioOpenDownloads: true }),
	chooseDownloadsFolder: () => window.__electrobunSendToHost({ nuvioDownloadsFolder: "choose" }),
	resetDownloadsFolder: () => window.__electrobunSendToHost({ nuvioDownloadsFolder: "default" }),
	defaultDownloadsFolder: ${JSON.stringify(defaultDownloadsDir)},
};`;
// The page asks for mpv through this; it only exists when there is one.
const MPV_BRIDGE = `Object.assign(window.nuvioDesktop, {
	mpv: (request) => window.__electrobunSendToHost({ nuvioMpv: request }),
	stopMpv: () => window.__electrobunSendToHost({ nuvioMpvStop: true }),
});`;
// mpv drawing in this window, under the page: macOS only for now.
const ENGINE_BRIDGE = `Object.assign(window.nuvioDesktop, { engine: {
	open: (request) => window.__electrobunSendToHost({ nuvioEngine: { op: "open", request } }),
	command: (command) => window.__electrobunSendToHost({ nuvioEngine: { op: "command", command } }),
	close: () => window.__electrobunSendToHost({ nuvioEngine: { op: "close" } }),
	always: ${process.env.NUVIO_MPV_ENGINE === "always"},
} });`;

function dispatch(name: string, detail: unknown) {
	window.webview.executeJavascript(
		`window.dispatchEvent(new CustomEvent(${JSON.stringify(name)}, { detail: ${JSON.stringify(detail)} }))`,
	);
}

// Loaded before the window so the page is only offered an engine that works;
// it reaches the window lazily, on the first source it opens.
const engine = MpvEngine.load({
	window: () => window.ptr,
	onState: (state) => dispatch("nuvio:engine", state),
	onProgress: (event) => dispatch("nuvio:mpv", event),
	log: (level, message, data) => logs.write("mpv", level, message, data),
});

const window = new BrowserWindow({
	title: "Nuvio Web",
	html: splash({ logo }),
	frame: { width: 1280, height: 800 },
	preload: [
		PAGE_LOGGER,
		DESKTOP_BRIDGE,
		mpvBinary ? MPV_BRIDGE : "",
		engine ? ENGINE_BRIDGE : "",
	].join("\n"),
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
	const engineMessage = (
		detail as
			| { nuvioEngine?: { op?: unknown; request?: unknown; command?: unknown } }
			| undefined
	)?.nuvioEngine;
	if (engineMessage) {
		handleEngine(engineMessage);
		return;
	}
	const folderChoice = (
		detail as { nuvioDownloadsFolder?: unknown } | undefined
	)?.nuvioDownloadsFolder;
	if (folderChoice === "choose" || folderChoice === "default") {
		void changeDownloadsFolder(folderChoice).catch((error) =>
			logs.write("shell", "error", "Changing the downloads folder failed", {
				error: String(error),
			}),
		);
		return;
	}
	if (
		(detail as { nuvioOpenDownloads?: unknown } | undefined)?.nuvioOpenDownloads
	) {
		mkdirSync(downloadsDir, { recursive: true });
		Utils.openPath(downloadsDir);
		return;
	}
	if ((detail as { nuvioMpvStop?: unknown } | undefined)?.nuvioMpvStop) {
		mpv?.stop();
		return;
	}
	const mpvRequest = (detail as { nuvioMpv?: unknown } | undefined)?.nuvioMpv;
	if (mpvRequest !== undefined) {
		const request = parseMpvRequest(mpvRequest, downloadsDir);
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
/** Only well-formed engine requests from the page reach mpv. */
function handleEngine(message: {
	op?: unknown;
	request?: unknown;
	command?: unknown;
}) {
	if (!engine) {
		return;
	}
	if (message.op === "open") {
		const request = parseMpvRequest(message.request, downloadsDir);
		if (request) {
			engine.open(request);
		} else {
			logs.write("shell", "warn", "Refused an engine request", { message });
		}
	} else if (message.op === "close") {
		engine.close();
	} else if (message.op === "command") {
		const command = parseEngineCommand(message.command);
		if (command) {
			engine.command(command);
		} else {
			logs.write("shell", "warn", "Refused an engine command", { message });
		}
	}
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

/** `update` is a downloaded version, offered from the app menu. */
const appMenu = (update?: string): ApplicationMenuItemConfig[] => [
	{
		label: "Nuvio Web",
		submenu: [
			...(update
				? [
						{
							label: `Restart to Update to ${update}`,
							action: "install-update",
						},
						{ type: "separator" as const },
					]
				: []),
			{ role: "hide" },
			{ role: "quit" },
		],
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
];
ApplicationMenu.setApplicationMenu(appMenu());
let readyUpdate = "";
ApplicationMenu.on("application-menu-clicked", (event) => {
	const action = (event as { data?: { action?: string } }).data?.action;
	if (action === "reload") {
		window.webview.executeJavascript("location.reload()");
	} else if (action === "install-update" && readyUpdate) {
		void installUpdate(updateLog, readyUpdate);
	}
});

let server: ReturnType<typeof startServer> | null = startServer();

function startServer() {
	const child = Bun.spawn(
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
				// The server downloads there, and plays the files back from there.
				NUVIO_DOWNLOADS_DIR: downloadsDir,
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
	void logs.pipe(child.stdout, "info");
	void logs.pipe(child.stderr, "error");
	void child.exited.then((code) => {
		// One stopped on purpose, for a new downloads folder, isn't a failure.
		const failed = !quitting && child === server;
		logs.write("shell", failed ? "error" : "info", "Server exited", { code });
		if (failed) {
			showSplash(`The server stopped (exit ${code}). Logs: ${logs.path}`, true);
		}
	});
	return child;
}

let quitting = false;
Electrobun.events.on("before-quit", () => {
	quitting = true;
	logs.write("shell", "info", "Quitting");
	mpv?.stop();
	server?.kill("SIGTERM");
});

/**
 * Downloads go to `choice` from now on: a folder the user picks, or the
 * default. The server reads its folder once, so it restarts on the new one;
 * what is in the old folder stays there.
 */
async function changeDownloadsFolder(choice: "choose" | "default") {
	let folder = defaultDownloadsDir;
	if (choice === "choose") {
		const [picked] = await Utils.openFileDialog({
			startingFolder: downloadsDir,
			canChooseFiles: false,
			canChooseDirectory: true,
			allowsMultipleSelection: false,
		});
		if (!(picked && isFolder(picked))) {
			return;
		}
		folder = picked;
	}
	if (folder === downloadsDir) {
		return;
	}
	if (folder === defaultDownloadsDir) {
		rmSync(downloadsFolderFile, { force: true });
	} else {
		writeFileSync(downloadsFolderFile, folder);
	}
	logs.write("shell", "info", "Downloads folder changed", { folder });
	downloadsDir = folder;
	mpv?.stop();
	engine?.close();
	showSplash("Restarting…");
	const previous = server;
	server = null;
	previous?.kill("SIGTERM");
	await previous?.exited;
	server = startServer();
	await openWhenUp();
}

async function healthy(): Promise<boolean> {
	try {
		return (await fetch(`${origin}/api/health`)).ok;
	} catch {
		return false;
	}
}

/** Shows the app once its server answers; false when it never did. */
async function openWhenUp(): Promise<boolean> {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	// biome-ignore lint/performance/noAwaitInLoops: polling, one request at a time
	while (!(await healthy()) && Date.now() < deadline && !quitting) {
		await Bun.sleep(150);
	}
	if (await healthy()) {
		logs.write("shell", "info", "Server up");
		await Bun.sleep(Math.max(0, splashShownAt + INTRO_MS - Date.now()));
		window.webview.executeJavascript(LEAVE_SCRIPT);
		await Bun.sleep(LEAVE_MS);
		window.webview.loadURL(`${origin}/`);
		return true;
	}
	if (!quitting) {
		logs.write("shell", "error", "Server didn't start in time");
		showSplash(`The server didn't start. Logs: ${logs.path}`, true);
	}
	return false;
}

if (await openWhenUp()) {
	watchForUpdates(updateLog, (version) => {
		readyUpdate = version;
		ApplicationMenu.setApplicationMenu(appMenu(version));
	});
}
