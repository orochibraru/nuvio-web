import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Updater, Utils } from "electrobun/main";

// Updates come from the latest stable GitHub release (`release.baseUrl`). They
// download while the app runs and are offered at the next launch, before the
// server starts: the native dialog blocks the shell until it is answered, and
// mid-session that would stall the server's logs and mpv with it.

type Log = (level: string, message: string, data?: unknown) => void;

/** The version downloaded and waiting, written once it is ready. */
const READY_FILE = join(Utils.paths.userData, "update-ready");

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
	log("info", "Installing the update", { version });
	// Quits and relaunches on success; reports an error status and returns otherwise.
	await Updater.applyUpdate();
}

/** Looks for a newer release and downloads it, for the next launch to offer. */
export async function downloadUpdateInBackground(log: Log) {
	Updater.onStatusChange((entry) => {
		if (entry.status !== "download-progress") {
			log(
				entry.status === "error" ? "warn" : "debug",
				`update: ${entry.message}`,
				entry.details,
			);
		}
	});
	const found = await Updater.checkForUpdate();
	if (!found.updateAvailable) {
		return;
	}
	if (!found.updateReady) {
		await Updater.downloadUpdate();
	}
	if (Updater.updateInfo().updateReady) {
		writeFileSync(READY_FILE, found.version);
		log("info", "Update downloaded, offered at next launch", {
			version: found.version,
		});
	}
}
