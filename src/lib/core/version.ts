import { version } from "../../../package.json" with { type: "json" };

/**
 * The app's release version (`package.json`), e.g. `1.0.21`. The one place that
 * reads `package.json`: a named import, so the bundle carries the string and
 * not the whole manifest. Not `$app/env`'s `version`, which is a build hash.
 */
export function getVersion(): string {
	return version;
}
