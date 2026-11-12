import process from "node:process";
import type { ElectrobunConfig } from "electrobun";
import root from "../package.json" with { type: "json" };

// Windows only runs a binary named .exe; Hutch builds on the target OS.
const server =
	process.platform === "win32" ? "server/server.exe" : "server/server";

export default {
	app: {
		name: "Nuvio Web",
		identifier: "com.zedensix.nuvio-web",
		version: root.version,
		description: "Nuvio Web as a desktop app, with its own server built in.",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// The SvelteKit server, compiled by `scripts/pre-build.ts`.
		copy: {
			[server]: server,
			// The splash's logo (src/bun/splash.ts).
			"../static/logo.webp": "logo.webp",
			// Fetched by the pre-build on macOS and Windows; Linux uses the system's.
			...(process.platform === "linux" ? {} : { mpv: "mpv" }),
			// mpv in the app's own window (scripts/build-mpv-macos.ts).
			...(process.platform === "darwin"
				? { "native/build/libnuvio-mpv.dylib": "native/libnuvio-mpv.dylib" }
				: {}),
		},
		mac: {
			bundleCEF: false,
			icons: "icon.iconset",
			// scripts/post-package.ts makes the DMG.
			createDmg: false,
			// Signing is off until there's an Apple Developer account. To turn it
			// back on, restore these and the Desktop workflow's signing steps.
			// codesign: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
			// notarize: Boolean(
			// 	process.env.ELECTROBUN_DEVELOPER_ID && process.env.ELECTROBUN_APPLEID,
			// ),
			codesign: false,
			notarize: false,
		},
		linux: {
			bundleCEF: false,
			icon: "../static/icon-512.png",
		},
		win: {
			bundleCEF: false,
			// Windows icons stop at 256 px; a larger PNG is refused.
			icon: "../static/icon-192.png",
		},
	},
	scripts: {
		preBuild: "./scripts/pre-build.ts",
		postBuild: "./scripts/post-build.ts",
		postPackage: "./scripts/post-package.ts",
	},
	// The updater reads the latest stable release, which the Desktop workflow
	// fills for every target. Updates are the full archive: a patch is diffed
	// against the previous release's, and while the release builds `latest`
	// already points at the new, still empty one.
	release: {
		baseUrl: "https://github.com/zedensix/nuvio-web/releases/latest/download",
		generatePatch: false,
	},
} satisfies ElectrobunConfig;
