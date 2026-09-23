import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILE_NAME = "session-secret";

/**
 * The key the session cookie is signed with. `NUVIO_SESSION_SECRET` wins when
 * set; otherwise it lives in `<dataDir>/session-secret`, generated on first
 * boot, so a self-hosted deploy that already mounts the data volume gets a
 * stable secret with no new config. Losing the file only signs everyone out.
 *
 * Server only (`node:fs`), and deliberately not in the `services` barrel.
 */
export function loadSessionSecret(fromEnv: string, dataDir: string): string {
	if (fromEnv) {
		return fromEnv;
	}
	const file = path.join(dataDir, FILE_NAME);
	try {
		mkdirSync(dataDir, { recursive: true });
		// `wx`: never clobber an existing secret, including one another
		// process wrote between our check and this write.
		writeFileSync(file, randomBytes(32).toString("hex"), {
			flag: "wx",
			mode: 0o600,
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw error;
		}
	}
	const secret = readFileSync(file, "utf8").trim();
	if (!secret) {
		throw new Error(`${file} is empty: delete it to generate a new one.`);
	}
	return secret;
}
