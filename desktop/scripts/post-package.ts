import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";

// The macOS DMG, made here instead of by Electrobun: its `hdiutil create` has
// no `-size`, and hdiutil's own guess runs out of room on CI runners.

const {
	ELECTROBUN_OS,
	ELECTROBUN_ARCH,
	ELECTROBUN_APP_NAME,
	ELECTROBUN_BUILD_DIR,
	ELECTROBUN_ARTIFACT_DIR,
} = process.env;

if (ELECTROBUN_OS === "macos") {
	if (
		!(ELECTROBUN_APP_NAME && ELECTROBUN_BUILD_DIR && ELECTROBUN_ARTIFACT_DIR)
	) {
		throw new Error(
			"ELECTROBUN_APP_NAME, ELECTROBUN_BUILD_DIR and ELECTROBUN_ARTIFACT_DIR must be set",
		);
	}
	// The self-extracting wrapper Electrobun would have put in its DMG.
	const app = join(ELECTROBUN_BUILD_DIR, `${ELECTROBUN_APP_NAME}.app`);
	const staging = mkdtempSync(join(tmpdir(), "nuvio-dmg-"));
	try {
		cpSync(app, join(staging, basename(app)), {
			recursive: true,
			verbatimSymlinks: true,
		});
		symlinkSync("/Applications", join(staging, "Applications"));
		const kilobytes = Number(
			Bun.spawnSync(["du", "-sk", staging]).stdout.toString().split("\t")[0],
		);
		const megabytes = Math.ceil((kilobytes / 1024) * 1.2) + 32;
		const dmg = join(
			ELECTROBUN_ARTIFACT_DIR,
			`${ELECTROBUN_OS}-${ELECTROBUN_ARCH}-NuvioWeb.dmg`,
		);
		const result = Bun.spawnSync(
			[
				"hdiutil",
				"create",
				"-volname",
				ELECTROBUN_APP_NAME,
				"-srcfolder",
				staging,
				"-size",
				`${megabytes}m`,
				"-format",
				"ULFO",
				"-ov",
				dmg,
			],
			{ stdout: "inherit", stderr: "inherit" },
		);
		if (result.exitCode !== 0) {
			throw new Error(`hdiutil create exited with ${result.exitCode}`);
		}
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}
