import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Updater, Utils } from "electrobun/main";

// Updates come from the latest stable GitHub release (`release.baseUrl`). They
// download while the app runs, and the app menu then offers to restart into
// them. A launch that finds one still waiting asks first, before the server
// starts: the native dialog blocks the shell until it is answered, and
// mid-session that would stall the server's logs and mpv with it.

type Log = (level: string, message: string, data?: unknown) => void;

/** The version downloaded and waiting, written once it is ready. */
const READY_FILE = join(Utils.paths.userData, "update-ready");
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Quits and relaunches into the downloaded update; logs an error status and returns otherwise. */
export async function installUpdate(log: Log, version: string) {
	rmSync(READY_FILE, { force: true });
	log("info", "Installing the update", { version });
	await Updater.applyUpdate();
}

/** Offers an update an earlier launch downloaded; resolves if there is none or the user waits. */
export async function offerDownloadedUpdate(log: Log) {
	let version: string;
	try {
		version = readFileSync(READY_FILE, "utf8").trim();
	} catch {
		return;
	}
	// Asked once per download: a launch that finds it still ready writes it back.
	rmSync(READY_FILE, { force: true });
	const { response } = await Utils.showMessageBox({
		type: "info",
		title: "Update ready",
		message: `Nuvio Web ${version} is ready to install.`,
		detail: "The app restarts into it.",
		buttons: ["Install and restart", "Later"],
		defaultId: 0,
		cancelId: 1,
	});
	if (response !== 0) {
		log("info", "Update postponed", { version });
		return;
	}
	await installUpdate(log, version);
}

/** Looks for a newer release and downloads it; resolves to its version once it is ready. */
async function downloadUpdate(log: Log): Promise<string | undefined> {
	const found = await Updater.checkForUpdate();
	if (!found.updateAvailable) {
		return;
	}
	if (!found.updateReady) {
		await Updater.downloadUpdate();
	}
	if (!Updater.updateInfo().updateReady) {
		return;
	}
	writeFileSync(READY_FILE, found.version);
	log("info", "Update downloaded", { version: found.version });
	return found.version;
}

/** Checks now and every few hours; `onReady` gets each downloaded version. */
export function watchForUpdates(log: Log, onReady: (version: string) => void) {
	Updater.onStatusChange((entry) => {
		if (entry.status !== "download-progress") {
			log(
				entry.status === "error" ? "warn" : "debug",
				`update: ${entry.message}`,
				entry.details,
			);
		}
	});
	let checking = false;
	const check = async () => {
		if (checking) {
			return;
		}
		checking = true;
		try {
			const version = await downloadUpdate(log);
			if (version) {
				onReady(version);
			}
		} catch (error) {
			log("warn", "Update check failed", { error: String(error) });
		} finally {
			checking = false;
		}
	};
	void check();
	setInterval(check, CHECK_EVERY_MS);
}
