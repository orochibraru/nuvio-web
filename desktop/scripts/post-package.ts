import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";

// The macOS DMG, made here instead of by Electrobun: its `hdiutil create` has
// no `-size`, and hdiutil's own guess runs out of room on CI runners. A dev
// build (`build/dev-<os>-<arch>`) is only run, never shipped: no DMG.

const {
	ELECTROBUN_OS,
	ELECTROBUN_ARCH,
	ELECTROBUN_APP_NAME,
	ELECTROBUN_BUILD_DIR,
	ELECTROBUN_ARTIFACT_DIR,
} = process.env;

const devBuild = basename(ELECTROBUN_BUILD_DIR ?? "").startsWith("dev-");

function run(command: string[]): string {
	const result = Bun.spawnSync(command, { stderr: "inherit" });
	const output = result.stdout.toString();
	if (result.exitCode !== 0) {
		throw new Error(
			`${command[0]} ${command[1]} exited with ${result.exitCode}: ${output}`,
		);
	}
	return output;
}

/**
 * Signs and notarizes the DMG as Hutch does the app inside it, under the same
 * variables: with none set, it stays unsigned.
 */
function _signDmg(dmg: string) {
	const {
		ELECTROBUN_DEVELOPER_ID,
		ELECTROBUN_APPLEID,
		ELECTROBUN_APPLEIDPASS,
		ELECTROBUN_TEAMID,
	} = process.env;
	if (!ELECTROBUN_DEVELOPER_ID) {
		return;
	}
	run([
		"codesign",
		"--force",
		"--timestamp",
		"--sign",
		ELECTROBUN_DEVELOPER_ID,
		dmg,
	]);
	if (!ELECTROBUN_APPLEID) {
		return;
	}
	if (!(ELECTROBUN_APPLEIDPASS && ELECTROBUN_TEAMID)) {
		throw new Error(
			"ELECTROBUN_APPLEIDPASS and ELECTROBUN_TEAMID must be set with ELECTROBUN_APPLEID",
		);
	}
	const submission = JSON.parse(
		run([
			"xcrun",
			"notarytool",
			"submit",
			dmg,
			"--apple-id",
			ELECTROBUN_APPLEID,
			"--password",
			ELECTROBUN_APPLEIDPASS,
			"--team-id",
			ELECTROBUN_TEAMID,
			"--wait",
			"--output-format",
			"json",
		]),
	) as { id?: string; status?: string };
	if (submission.status !== "Accepted") {
		throw new Error(
			`Notarization of the DMG ended ${submission.status} (submission ${submission.id}); see \`xcrun notarytool log ${submission.id}\``,
		);
	}
	run(["xcrun", "stapler", "staple", dmg]);
}

if (ELECTROBUN_OS === "macos" && !devBuild) {
	if (
		!(ELECTROBUN_APP_NAME && ELECTROBUN_BUILD_DIR && ELECTROBUN_ARTIFACT_DIR)
	) {
		throw new Error(
			"ELECTROBUN_APP_NAME, ELECTROBUN_BUILD_DIR and ELECTROBUN_ARTIFACT_DIR must be set",
		);
	}
	// The self-extracting wrapper Electrobun would have put in its DMG. Its
	// name carries the channel (`Nuvio Web-canary.app`), so take the one there.
	const bundle = readdirSync(ELECTROBUN_BUILD_DIR).find((name) =>
		name.endsWith(".app"),
	);
	if (!bundle) {
		throw new Error(`No .app in ${ELECTROBUN_BUILD_DIR}`);
	}
	const app = join(ELECTROBUN_BUILD_DIR, bundle);
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
		// Off until there's an Apple Developer account, like the app's signing.
		// signDmg(dmg);
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}
