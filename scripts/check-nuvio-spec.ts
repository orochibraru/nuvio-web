#!/usr/bin/env bun
/**
 * Drift check for the Nuvio public API spec.
 *
 * The typed client in src/lib/nuvio/ is derived by hand from the prose spec at
 * SPEC_URL. This script fetches that spec and compares it to the committed
 * snapshot; a difference means the client may be out of date.
 *
 *   bun run nuvio:check          fail (exit 1) and print a diff if the spec moved
 *   bun run nuvio:check:accept   overwrite the snapshot with the current spec
 *
 * Accept only after reconciling src/lib/nuvio/types.ts and client.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SPEC_URL = "https://nuvio.tv/docs/nuvio-public-api.md";
const SNAPSHOT_PATH = fileURLToPath(
	new URL("../src/lib/nuvio/nuvio-public-api.snapshot.md", import.meta.url),
);

const shouldUpdate = process.argv.includes("--update");

function normalize(text: string): string {
	return `${text
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.trimEnd()}\n`;
}

function specVersion(text: string): string {
	return text.match(/\*\*Version:\*\*\s*([^\s·&]+)/)?.[1] ?? "unknown";
}

const response = await fetch(SPEC_URL);
if (!response.ok) {
	console.error(
		`Failed to fetch ${SPEC_URL}: ${response.status} ${response.statusText}`,
	);
	process.exit(2);
}
const remote = normalize(await response.text());

if (shouldUpdate) {
	writeFileSync(SNAPSHOT_PATH, remote);
	console.log(`Snapshot updated to spec version ${specVersion(remote)}.`);
	process.exit(0);
}

if (!existsSync(SNAPSHOT_PATH)) {
	console.error(
		`No snapshot at ${SNAPSHOT_PATH}. Run \`bun run nuvio:check:accept\` to create it.`,
	);
	process.exit(1);
}

const snapshot = normalize(readFileSync(SNAPSHOT_PATH, "utf8"));
if (remote === snapshot) {
	console.log(`Nuvio API spec unchanged (version ${specVersion(remote)}).`);
	process.exit(0);
}

console.error(
	[
		`Nuvio API spec changed: snapshot ${specVersion(snapshot)} -> remote ${specVersion(remote)}.`,
		"Reconcile src/lib/nuvio/types.ts and client.ts, then run `bun run nuvio:check:accept`.",
		"",
	].join("\n"),
);

const remoteTmp = `${SNAPSHOT_PATH}.remote.tmp`;
writeFileSync(remoteTmp, remote);
try {
	const diff = spawnSync(
		"diff",
		["-u", "-L", "snapshot", "-L", "remote", SNAPSHOT_PATH, remoteTmp],
		{ encoding: "utf8" },
	);
	process.stderr.write(diff.stdout ?? "");
} finally {
	rmSync(remoteTmp, { force: true });
}
process.exit(1);
