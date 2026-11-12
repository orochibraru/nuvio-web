export interface Installer {
	file: string;
	label: string;
}

/** The installers the Desktop workflow attaches to every stable release. */
export const INSTALLERS = [
	{ file: "macos-arm64-NuvioWeb.dmg", label: "macOS (Apple Silicon)" },
	{ file: "macos-x64-NuvioWeb.dmg", label: "macOS (Intel)" },
	{ file: "win-x64-NuvioWeb-Setup.zip", label: "Windows" },
	{ file: "linux-x64-NuvioWeb-Setup.tar.gz", label: "Linux (x64)" },
	{ file: "linux-arm64-NuvioWeb-Setup.tar.gz", label: "Linux (ARM64)" },
] as const satisfies readonly Installer[];

export function installerUrl(installer: Installer): string {
	return `https://github.com/zedensix/nuvio-web/releases/latest/download/${installer.file}`;
}

export interface Device {
	/** `navigator.userAgentData.platform`, else `navigator.platform`. */
	platform: string;
	userAgent: string;
	/** `getHighEntropyValues(["architecture"])`: `"arm"` or `"x86"`, Chromium only. */
	architecture?: string;
	/** `navigator.maxTouchPoints`: an iPad asks for desktop sites as a Mac. */
	touchPoints: number;
}

/**
 * The installer built for `device`, or `null` for a phone, a tablet or an OS
 * there is no build for. A Mac that doesn't say its architecture (Safari,
 * Firefox) gets Apple Silicon; Windows only has an x64 build, which Windows on
 * ARM runs.
 */
export function matchInstaller(device: Device): Installer | null {
	const system = `${device.platform} ${device.userAgent}`.toLowerCase();
	if (/android|iphone|ipad|cros/.test(system)) {
		return null;
	}
	const arm =
		device.architecture === undefined
			? /aarch64|arm64/.test(system)
			: device.architecture === "arm";
	if (system.includes("mac")) {
		if (device.touchPoints > 1) {
			return null;
		}
		return device.architecture === "x86" ? INSTALLERS[1] : INSTALLERS[0];
	}
	if (system.includes("win")) {
		return INSTALLERS[2];
	}
	if (system.includes("linux")) {
		return arm ? INSTALLERS[4] : INSTALLERS[3];
	}
	return null;
}
