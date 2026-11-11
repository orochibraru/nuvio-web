/** An RFC 9110 field name. */
const TOKEN = /^[!#$%&'*+.^_`|~\w-]+$/;
/** Visible ASCII, spaces and tabs: no CR / LF to split a request with. */
const VALUE = /^[\t\x20-\x7e]*$/;
/**
 * Framing, hop-by-hop and routing headers: the HTTP client owns them, and the
 * downloader and mpv send their own `Range`.
 */
const REFUSED = new Set([
	"connection",
	"content-length",
	"expect",
	"host",
	"keep-alive",
	"proxy-authorization",
	"proxy-connection",
	"range",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);
const MAX_HEADERS = 20;
const MAX_NAME = 64;
const MAX_VALUE = 4096;
const MAX_TOTAL = 8192;

/**
 * The request headers an addon asks a stream to be fetched with
 * (`behaviorHints.proxyHeaders.request`), keeping only well-formed ones the
 * client may set, names lowercased. Undefined when none survive.
 */
export function safeRequestHeaders(
	value: unknown,
): Record<string, string> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	const headers: Record<string, string> = {};
	let count = 0;
	let total = 0;
	for (const [rawName, rawValue] of Object.entries(value)) {
		const name = rawName.toLowerCase();
		if (
			typeof rawValue !== "string" ||
			name.length > MAX_NAME ||
			rawValue.length > MAX_VALUE ||
			!TOKEN.test(name) ||
			!VALUE.test(rawValue) ||
			REFUSED.has(name) ||
			name.startsWith("proxy-") ||
			Object.hasOwn(headers, name)
		) {
			continue;
		}
		const size = name.length + rawValue.length;
		if (count >= MAX_HEADERS || total + size > MAX_TOTAL) {
			break;
		}
		headers[name] = rawValue.trim();
		count++;
		total += size;
	}
	return count > 0 ? headers : undefined;
}
