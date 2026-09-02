#!/usr/bin/env bun
/**
 * Called by semantic-release's @semantic-release/exec `prepareCmd`
 * (`.releaserc.json`) with the next version as argv[0], e.g.
 * `bun scripts/bump-version.ts 0.2.0`. Bumps the `version` field in every
 * package.json semantic-release should track: the root app plus the three
 * standalone sub-projects (agent/installer/cli), which don't get their own
 * independent version numbers, one release version for the whole repo,
 * same as every other cross-cutting thing here (one CLAUDE.md, one TODO.md).
 *
 * Deliberately not `@semantic-release/npm` with `npmPublish: false` for
 * this, that plugin still wants npm-registry-shaped auth/config present
 * even when not publishing, and this repo has no npm package to publish
 * (it's an app, not a library), a small script matches this codebase's
 * existing "hand-roll a small thing rather than pull in a mismatched tool"
 * posture (the cron matcher, the SigV4 client) better than fighting a tool
 * built for a different use case.
 */

import process from "node:process";
import Bun from "bun";

const nextVersion = process.argv[2];
if (!nextVersion) {
	console.error("Usage: bun scripts/bump-version.ts <version>");
	process.exit(1);
}

const path = "package.json";

const file = Bun.file(path);
const pkg = await file.json();
pkg.version = nextVersion;
await Bun.write(path, `${JSON.stringify(pkg, null, "\t")}\n`);
console.log(`Bumped ${path} to ${nextVersion}`);
