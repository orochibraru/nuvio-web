/**
 * Returns `value` only when it is an `http:` / `https:` URL, else `null`. Guards
 * addon-supplied URLs bound to `href` / `src` / `window.open` against
 * `javascript:` and `data:` injection.
 */
export function httpUrlOrNull(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	try {
		const { protocol } = new URL(value);
		if (protocol === "http:" || protocol === "https:") {
			return value;
		}
	} catch {
		return null;
	}
	return null;
}
