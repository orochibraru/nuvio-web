import { error } from "@sveltejs/kit";
import { httpUrlOrNull } from "#lib/core/url.js";
import { m } from "#lib/i18n/index.js";
import { pinnedFetch, safeFetch } from "#lib/server/safe-fetch.js";
import { LOGGER } from "#lib/services/index.js";
import type { RequestHandler } from "./$types";

/**
 * Same-origin pass-through for downloads the browser cannot fetch itself: a
 * stream host that sends no CORS headers, or a plain `http:` source under an
 * `https:` page (the CSP's `connect-src` and mixed-content rules both refuse
 * it). The download worker tries the source directly first and only falls
 * back here, so this carries bytes only when it has to.
 *
 * - **Signed-in only.** A session is required, so this is not an open proxy;
 *   an instance lock evicts sessions before they reach here.
 * - **SSRF-guarded.** `safeFetch` refuses private, loopback and link-local
 *   addresses and re-checks every redirect hop, and `pinnedFetch` connects to
 *   the address it checked (no DNS rebinding) without the request's cookies,
 *   exactly as for addon URLs. Upstream error details stay in the server log.
 * - **Streams.** The upstream body is piped through, never buffered, and
 *   `Range` goes up so downloads resume and segments can be byte ranges.
 * - **Never a page.** The bytes are attacker-chosen, so a navigation is
 *   refused, a non-media `content-type` becomes `application/octet-stream`,
 *   and the response is sandboxed, `nosniff` and an attachment.
 */

const PASSED_HEADERS = [
	"content-length",
	"content-range",
	"accept-ranges",
	"last-modified",
	"etag",
];

const MEDIA_TYPES = new Set([
	"application/vnd.apple.mpegurl",
	"application/x-mpegurl",
	"application/octet-stream",
	"application/mp4",
	"text/vtt",
]);

const NAVIGATION_DESTINATIONS = new Set([
	"document",
	"iframe",
	"frame",
	"embed",
	"object",
]);

function mediaType(value: string | null): string {
	const essence = (value ?? "").split(";")[0].trim().toLowerCase();
	return /^(video|audio)\/[\w.+-]+$/.test(essence) || MEDIA_TYPES.has(essence)
		? essence
		: "application/octet-stream";
}

export const GET: RequestHandler = async ({ url, request, locals }) => {
	if (!locals.session) {
		error(401, m.error_download_sign_in());
	}
	if (
		NAVIGATION_DESTINATIONS.has(request.headers.get("sec-fetch-dest") ?? "")
	) {
		error(403, m.error_download_navigation());
	}
	const target = httpUrlOrNull(url.searchParams.get("url"));
	if (!target) {
		error(400, m.error_download_source_url());
	}

	const headers: Record<string, string> = {};
	const range = request.headers.get("range");
	if (range && /^bytes=\d*-\d*$/.test(range)) {
		headers.range = range;
	}

	let upstream: Response;
	try {
		upstream = await safeFetch(
			target,
			pinnedFetch,
			{ headers, signal: request.signal },
			{ allowHttp: true },
		);
	} catch (cause) {
		locals.services.get(LOGGER).warn("download proxy fetch failed", {
			origin: new URL(target).origin,
			error: cause instanceof Error ? cause.message : String(cause),
		});
		error(502, m.error_download_source_refused());
	}

	const out = new Headers({
		"cache-control": "no-store",
		"content-type": mediaType(upstream.headers.get("content-type")),
		"content-security-policy": "sandbox; default-src 'none'",
		"x-content-type-options": "nosniff",
		"content-disposition": "attachment",
	});
	for (const name of PASSED_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) {
			out.set(name, value);
		}
	}
	return new Response(upstream.body, { status: upstream.status, headers: out });
};
