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

const PROBE_ORIGIN = "http://x";

/**
 * `value` as a same-origin path (pathname + search + hash), else `fallback`.
 * For `redirectTo`-style params: a bare `startsWith("/")` check lets `/\evil`
 * and `/<tab>/evil` through, which browsers normalise to `//evil`. Anything with
 * a backslash or control character is refused outright, then the rest must
 * resolve against a probe origin without leaving it.
 */
export function safeRedirectPath(
	value: string | null | undefined,
	fallback: string,
): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
	if (!value?.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) {
		return fallback;
	}
	// Can't throw: a value starting with "/" always resolves against a base.
	const url = new URL(value, PROBE_ORIGIN);
	return url.origin === PROBE_ORIGIN
		? url.pathname + url.search + url.hash
		: fallback;
}
