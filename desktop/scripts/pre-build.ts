import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Compiles the SvelteKit server the app runs, fetches the mpv it falls back
// to for what the web view can't decode, and makes the macOS icon set.

const desktop = join(import.meta.dir, "..");
const root = join(desktop, "..");

const build = Bun.spawnSync(["bun", "run", "build"], {
	cwd: root,
	stdout: "inherit",
	stderr: "inherit",
});
if (build.exitCode !== 0) {
	throw new Error(`bun run build exited with ${build.exitCode}`);
}
const binary = process.env.ELECTROBUN_OS === "win" ? "server.exe" : "server";
mkdirSync(join(desktop, "server"), { recursive: true });
copyFileSync(join(root, "build", binary), join(desktop, "server", binary));

// mpv's own release builds, checked against the digest pinned here. Linux has
// none: the app uses the system's mpv there.
const MPV_RELEASE =
	"https://github.com/mpv-player/mpv/releases/download/v0.41.0";
const MPV_BUILDS: Record<string, { asset: string; sha256: string }> = {
	"macos-arm64": {
		asset: "mpv-v0.41.0-macos-14-arm.zip",
		sha256: "5c96f9b21355fc0a11d2e2161ad65f33031070e9fb3f6bd9865fb459b94587e6",
	},
	"macos-x64": {
		asset: "mpv-v0.41.0-macos-15-intel.zip",
		sha256: "41003617ab4f7784394b5ddea7ce51b3e0838e8cfc8166ad1a378b2eda3b583c",
	},
	"win-x64": {
		asset: "mpv-v0.41.0-x86_64-w64-mingw32.zip",
		sha256: "a49811c0752c108b8260636f9c6f6fcb97406641c98b30f1e7b500dfb20177de",
	},
};

function run(command: string[], cwd?: string) {
	const result = Bun.spawnSync(command, {
		cwd,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		throw new Error(`${command.join(" ")} exited with ${result.exitCode}`);
	}
}

/** A zip into `dir`: `tar` reads zips on Windows, `unzip` everywhere else. */
function unzip(file: string, dir: string) {
	mkdirSync(dir, { recursive: true });
	run(
		process.env.ELECTROBUN_OS === "win"
			? ["tar", "-xf", file, "-C", dir]
			: ["unzip", "-q", "-o", file, "-d", dir],
	);
}

const mpvBuild =
	MPV_BUILDS[`${process.env.ELECTROBUN_OS}-${process.env.ELECTROBUN_ARCH}`];
const mpvDir = join(desktop, "mpv");
rmSync(mpvDir, { recursive: true, force: true });
if (mpvBuild) {
	const cache = join(desktop, ".cache");
	const archive = join(cache, mpvBuild.asset);
	mkdirSync(cache, { recursive: true });
	if (!existsSync(archive)) {
		const response = await fetch(`${MPV_RELEASE}/${mpvBuild.asset}`);
		if (!response.ok) {
			throw new Error(`mpv download failed: ${response.status}`);
		}
		await Bun.write(archive, response);
	}
	const digest = createHash("sha256")
		.update(readFileSync(archive))
		.digest("hex");
	if (digest !== mpvBuild.sha256) {
		rmSync(archive);
		throw new Error(`mpv archive digest mismatch: ${digest}`);
	}
	// The release zips hold one more archive: a tarred mpv.app, or a zip.
	const outer = join(cache, "outer");
	rmSync(outer, { recursive: true, force: true });
	unzip(archive, outer);
	const inner = new Bun.Glob("*.{tar.gz,zip}").scanSync(outer).next().value;
	if (!inner) {
		throw new Error("mpv archive holds no inner archive");
	}
	if (inner.endsWith(".tar.gz")) {
		mkdirSync(mpvDir, { recursive: true });
		run(["tar", "-xzf", join(outer, inner), "-C", mpvDir]);
	} else {
		unzip(join(outer, inner), mpvDir);
	}
	rmSync(outer, { recursive: true, force: true });
}

if (process.env.ELECTROBUN_OS === "macos") {
	run(["bun", join(desktop, "scripts", "build-mpv-macos.ts")]);
}

if (process.env.ELECTROBUN_OS === "macos") {
	const iconset = join(desktop, "icon.iconset");
	const source = join(root, "static", "icon-512.png");
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);
	for (const size of [16, 32, 128, 256, 512]) {
		for (const scale of [1, 2]) {
			const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
			const pixels = String(size * scale);
			const resize = Bun.spawnSync([
				"sips",
				"-z",
				pixels,
				pixels,
				source,
				"--out",
				join(iconset, name),
			]);
			if (resize.exitCode !== 0) {
				throw new Error(`sips could not make ${name}`);
			}
		}
	}
}
