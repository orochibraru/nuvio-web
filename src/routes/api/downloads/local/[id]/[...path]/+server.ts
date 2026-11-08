import { error } from "@sveltejs/kit";
import { contentTypeFor, parseRange } from "#lib/downloads/files.js";
import { localDownloadsOf } from "#lib/downloads/local-downloads-data.js";
import { m } from "#lib/i18n/index.js";
import type { RequestHandler } from "./$types";

/**
 * A finished download's file from the desktop app's folder, with byte ranges
 * so the video seeks: the on-disk twin of the service worker's
 * `/offline-media/`. Only the profile that downloaded it gets it, and only as
 * media (the same type rules), never as a page.
 */
export const GET: RequestHandler = async ({ locals, params, request }) => {
	const { queue, owner } = localDownloadsOf(locals);
	const found = await queue.file(owner, params.id, params.path);
	const file = found ? globalThis.Bun.file(found.path) : null;
	if (!(found && file && (await file.exists()))) {
		error(404, m.error_not_found());
	}
	const size = file.size;
	const headers = new Headers({
		"accept-ranges": "bytes",
		"cache-control": "no-store",
		"content-type": contentTypeFor(params.path, found.mimeType),
		"content-security-policy": "sandbox; default-src 'none'",
		"x-content-type-options": "nosniff",
	});
	const range = parseRange(request.headers.get("range"), size);
	if (range === "unsatisfiable") {
		headers.set("content-range", `bytes */${size}`);
		return new Response(null, { status: 416, headers });
	}
	if (range === null) {
		headers.set("content-length", String(size));
		return new Response(file, { headers });
	}
	headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
	headers.set("content-length", String(range.end - range.start + 1));
	return new Response(file.slice(range.start, range.end + 1), {
		status: 206,
		headers,
	});
};
