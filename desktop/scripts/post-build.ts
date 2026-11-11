import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";
import config from "../electrobun.config.ts";

// `mise run install` takes the app as built here: Hutch would next compress it
// into a self-extracting wrapper that the first launch has to unpack again.
// Failing the hook is the only way to stop Hutch before it compresses.

const { NUVIO_UNPACKED_DIR, ELECTROBUN_BUILD_DIR, ELECTROBUN_APP_NAME } =
	process.env;

/**
 * Hutch fills in version.json after this hook: without its hash and release
 * URL the updater never checks, so they're written as Hutch would. The hash
 * only has to differ from a release's; the updater's version check does the rest.
 */
function finishVersionFile(app: string) {
	const file = join(app, "Contents", "Resources", "version.json");
	const name = ELECTROBUN_APP_NAME ?? "";
	writeFileSync(
		file,
		JSON.stringify({
			...JSON.parse(readFileSync(file, "utf8")),
			hash: Date.now().toString(36),
			baseUrl: config.release.baseUrl,
			name: name.replace(/ /g, ""),
			displayName: name,
		}),
	);
}

if (NUVIO_UNPACKED_DIR && ELECTROBUN_BUILD_DIR) {
	mkdirSync(NUVIO_UNPACKED_DIR, { recursive: true });
	for (const name of readdirSync(ELECTROBUN_BUILD_DIR)) {
		if (name.endsWith(".app")) {
			finishVersionFile(join(ELECTROBUN_BUILD_DIR, name));
		}
		renameSync(
			join(ELECTROBUN_BUILD_DIR, name),
			join(NUVIO_UNPACKED_DIR, name),
		);
	}
	process.exit(1);
}
