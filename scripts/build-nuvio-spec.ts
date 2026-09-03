#!/usr/bin/env bun
/**
 * Generates the machine-readable Nuvio API spec from the committed prose
 * snapshot : no LLM in the loop.
 *
 *   bun run nuvio:spec           regenerate src/lib/nuvio/nuvio-public-api.json
 *   bun run nuvio:spec:check     fail (exit 1) if the committed JSON is stale
 *
 * The prose snapshot itself is refreshed by `bun run nuvio:check:accept`
 * (scripts/check-nuvio-spec.ts), which re-runs this generator for you.
 *
 * Known deviation from strict OpenAPI: one route documented under several
 * query strings (`/auth/v1/token?grant_type=…`) keeps the query in the path
 * key. OpenAPI keys operations on method + path alone, so the alternative is
 * to collapse "Sign in" and "Refresh token" into a single operation with a
 * union body : worse for anyone generating a client. The generator reports it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { renderOpenApi } from "./nuvio-spec/index.ts";

export const SNAPSHOT_PATH = fileURLToPath(
	new URL("../src/lib/nuvio/nuvio-public-api.snapshot.md", import.meta.url),
);
export const OUTPUT_PATH = fileURLToPath(
	new URL("../src/lib/nuvio/nuvio-public-api.json", import.meta.url),
);

/** Shared with check-nuvio-spec.ts, which regenerates after accepting a spec. */
export function writeOpenApi(markdown: string): {
	operations: number;
	warnings: string[];
} {
	const { json, operations, warnings } = renderOpenApi(markdown);
	writeFileSync(OUTPUT_PATH, json);
	return { operations, warnings };
}

if (import.meta.main) {
	const markdown = readFileSync(SNAPSHOT_PATH, "utf8");

	if (process.argv.includes("--check")) {
		const { json, operations } = renderOpenApi(markdown);
		let current = "";
		try {
			current = readFileSync(OUTPUT_PATH, "utf8");
		} catch {
			console.error("Missing nuvio-public-api.json. Run `bun run nuvio:spec`.");
			process.exit(1);
		}
		if (current !== json) {
			console.error(
				"nuvio-public-api.json is out of date with the prose snapshot. Run `bun run nuvio:spec`.",
			);
			process.exit(1);
		}
		console.log(`Nuvio OpenAPI up to date (${operations} operations).`);
	} else {
		const { operations, warnings } = writeOpenApi(markdown);
		console.log(
			`Wrote ${operations} operations to src/lib/nuvio/nuvio-public-api.json.`,
		);
		for (const warning of warnings) {
			console.warn(`  note: ${warning}`);
		}
	}
}
