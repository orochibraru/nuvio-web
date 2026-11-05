import process from "node:process";
import type { ElectrobunConfig } from "electrobun";
import root from "../package.json" with { type: "json" };

// Windows only runs a binary named .exe; Hutch builds on the target OS.
const server =
	process.platform === "win32" ? "server/server.exe" : "server/server";

export default {
	app: {
		name: "Nuvio Web",
		identifier: "com.orochibraru.nuvio-web",
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
			// Fetched by the pre-build on macOS and Windows; Linux uses the system's.
			...(process.platform === "linux" ? {} : { mpv: "mpv" }),
		},
		mac: {
			bundleCEF: false,
			icons: "icon.iconset",
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
	},
} satisfies ElectrobunConfig;
