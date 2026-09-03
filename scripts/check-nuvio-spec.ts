#!/usr/bin/env bun
/**
 * Drift check for the Nuvio public API spec.
 *
 * Nuvio publishes the API as prose, so this fetches that page and compares it
 * to the committed snapshot. Two kinds of difference come out of that, and
 * they are not the same thing:
 *
 *   - The generated OpenAPI document changed -> the API itself moved, and
 *     src/lib/nuvio/types.ts + client.ts need reconciling. Exits 1.
 *   - Only the prose changed (a reword, or upstream rewrapping its lines)
 *     -> nothing to reconcile. Reported, but does not fail: opening an
 *     "API drifted" issue over a reflowed paragraph is how this check
 *     stopped being believed.
 *
 *   bun run nuvio:check          report; exit 1 only on a real API change
 *   bun run nuvio:check:accept   refresh the snapshot + regenerate the JSON
 *
 * The snapshot is a verbatim copy of an external document : keep it out of the
 * repo's formatters (see .prettierignore), or every `prettier --write` reflows
 * it and this check diffs our own wrapping forever.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	OUTPUT_PATH,
	SNAPSHOT_PATH,
	writeOpenApi,
} from "./build-nuvio-spec.ts";
import { renderOpenApi } from "./nuvio-spec/index.ts";

const SPEC_URL = "https://nuvio.tv/docs/nuvio-public-api.md";

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

/** Unified diff of two strings, via `diff(1)` on scratch files. */
function unifiedDiff(
	left: string,
	right: string,
	labels: [string, string],
): string {
	const base = fileURLToPath(new URL("../.nuvio-drift", import.meta.url));
	const leftPath = `${base}.left.tmp`;
	const rightPath = `${base}.right.tmp`;
	writeFileSync(leftPath, left);
	writeFileSync(rightPath, right);
	try {
		return (
			spawnSync(
				"diff",
				["-u", "-L", labels[0], "-L", labels[1], leftPath, rightPath],
				{ encoding: "utf8" },
			).stdout ?? ""
		);
	} finally {
		rmSync(leftPath, { force: true });
		rmSync(rightPath, { force: true });
	}
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
	const { operations, warnings } = writeOpenApi(remote);
	console.log(
		`Snapshot updated to spec version ${specVersion(remote)}; regenerated nuvio-public-api.json (${operations} operations).`,
	);
	for (const warning of warnings) {
		console.warn(`  note: ${warning}`);
	}
	process.exit(0);
}

if (!existsSync(SNAPSHOT_PATH)) {
	console.error(
		`No snapshot at ${SNAPSHOT_PATH}. Run \`bun run nuvio:check:accept\` to create it.`,
	);
	process.exit(1);
}

const snapshot = normalize(readFileSync(SNAPSHOT_PATH, "utf8"));
const committedJson = existsSync(OUTPUT_PATH)
	? readFileSync(OUTPUT_PATH, "utf8")
	: "";
const remoteJson = renderOpenApi(remote).json;

if (remoteJson !== committedJson) {
	console.error(
		[
			`Nuvio API changed: snapshot ${specVersion(snapshot)} -> remote ${specVersion(remote)}.`,
			"Reconcile src/lib/nuvio/types.ts and client.ts, then run `bun run nuvio:check:accept`.",
			"",
		].join("\n"),
	);
	process.stderr.write(
		unifiedDiff(committedJson, remoteJson, ["committed", "remote"]),
	);
	process.exit(1);
}

if (remote !== snapshot) {
	// Same API, different words on the page. Worth knowing, not worth an issue.
	const message = `Nuvio spec text changed but the API did not (version ${specVersion(remote)}). Run \`bun run nuvio:check:accept\` to refresh the snapshot.`;
	console.log(message);
	if (process.env.GITHUB_ACTIONS) {
		console.log(`::notice title=Nuvio spec reworded::${message}`);
	}
	process.stdout.write(unifiedDiff(snapshot, remote, ["snapshot", "remote"]));
	process.exit(0);
}

console.log(`Nuvio API spec unchanged (version ${specVersion(remote)}).`);
process.exit(0);
