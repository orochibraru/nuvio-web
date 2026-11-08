import { describe, expect, it } from "vitest";
import {
	type Device,
	installerUrl,
	matchInstaller,
} from "./desktop-installers.ts";

const MAC_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const LINUX_UA =
	"Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const LINUX_ARM_UA =
	"Mozilla/5.0 (X11; Linux aarch64; rv:132.0) Gecko/20100101 Firefox/132.0";
const ANDROID_UA =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

function file(device: Partial<Device> & Pick<Device, "userAgent">) {
	return (
		matchInstaller({ platform: "", touchPoints: 0, ...device })?.file ?? null
	);
}

describe("matchInstaller", () => {
	it("gives a Mac Apple Silicon unless Chromium says x86", () => {
		expect(file({ userAgent: MAC_UA, platform: "MacIntel" })).toBe(
			"macos-arm64-NuvioWeb.dmg",
		);
		expect(
			file({ userAgent: MAC_UA, platform: "macOS", architecture: "arm" }),
		).toBe("macos-arm64-NuvioWeb.dmg");
		expect(
			file({ userAgent: MAC_UA, platform: "macOS", architecture: "x86" }),
		).toBe("macos-x64-NuvioWeb.dmg");
	});

	it("gives Windows its only build, ARM included", () => {
		expect(file({ userAgent: WINDOWS_UA, platform: "Windows" })).toBe(
			"win-x64-NuvioWeb-Setup.zip",
		);
		expect(
			file({ userAgent: WINDOWS_UA, platform: "Windows", architecture: "arm" }),
		).toBe("win-x64-NuvioWeb-Setup.zip");
	});

	it("tells Linux x64 from ARM64", () => {
		expect(file({ userAgent: LINUX_UA, platform: "Linux x86_64" })).toBe(
			"linux-x64-NuvioWeb-Setup.tar.gz",
		);
		expect(file({ userAgent: LINUX_ARM_UA, platform: "Linux aarch64" })).toBe(
			"linux-arm64-NuvioWeb-Setup.tar.gz",
		);
		expect(
			file({ userAgent: LINUX_UA, platform: "Linux", architecture: "arm" }),
		).toBe("linux-arm64-NuvioWeb-Setup.tar.gz");
	});

	it("has nothing for phones and tablets", () => {
		expect(file({ userAgent: ANDROID_UA, platform: "Linux armv8l" })).toBe(
			null,
		);
		expect(
			file({ userAgent: MAC_UA, platform: "MacIntel", touchPoints: 5 }),
		).toBe(null);
	});
});

describe("installerUrl", () => {
	it("points at the latest stable release", () => {
		expect(
			installerUrl({ file: "win-x64-NuvioWeb-Setup.zip", label: "Windows" }),
		).toBe(
			"https://github.com/orochibraru/nuvio-web/releases/latest/download/win-x64-NuvioWeb-Setup.zip",
		);
	});
});
