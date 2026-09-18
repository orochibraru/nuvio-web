import {
	contentTypeFor,
	DOWNLOADS_DIR,
	PLAN_FILE,
	parseLocalMediaPath,
	parseRange,
} from "#lib/downloads/files.js";
import { version } from "$app/env";
import { assets, immutable, prerendered } from "$app/manifest";
import { self as sw } from "$app/service-worker";

/**
 * The app's service worker. Three jobs, nothing else:
 *
 * 1. **An installable, offline shell.** The build output and static files are
 *    precached per release, so the app opens without a network.
 * 2. **An offline fallback.** A navigation that fails (no network) gets the
 *    `/offline` page (cached at install), which lists and plays downloads. Online
 *    navigations always go to the network : the app is server-rendered and
 *    signed-in, and a cached page would show stale or someone else's data.
 * 3. **Downloaded media.** `/offline-media/<id>/<path>` is answered from the
 *    Origin Private File System, with range support so a `<video>` can seek.
 *    The player plays a download through that URL like any other source.
 *
 * API calls, remote functions and everything cross-origin pass straight
 * through, untouched.
 */

const CACHE = `nuvio-${version}`;
const OFFLINE_PAGE = "/offline";
// The root layout has a server load, so even an `ssr = false` shell fetches
// its data on boot.
const OFFLINE_DATA = "/offline/__data.json";

// The e2e fixtures (sample clips, HLS streams) ship in `static/` for the test
// run; they have no business in every visitor's cache.
const ASSETS = [...immutable, ...assets, ...prerendered]
	.map((entry) => `/${entry.path}`.replace(/^\/+/, "/"))
	.filter((path) => !path.startsWith("/e2e/"));
const ASSET_SET = new Set(ASSETS);

sw.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) =>
				Promise.all([
					cache.addAll(ASSETS),
					// Without cookies: the shell must not carry whoever happened to
					// be signed in when this worker installed.
					cache.add(new Request(OFFLINE_PAGE, { credentials: "omit" })),
					cache.add(new Request(OFFLINE_DATA, { credentials: "omit" })),
				]),
			)
			.then(() => sw.skipWaiting()),
	);
});

sw.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith("nuvio-") && key !== CACHE)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => sw.clients.claim()),
	);
});

async function fromCache(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	return cached ?? fetch(request);
}

async function navigate(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		// Redirect rather than answer in place: served at `/library`, the shell
		// would boot the client router into `/library`, whose data needs the
		// server. At its own URL it is the page it says it is.
		if (new URL(request.url).pathname !== OFFLINE_PAGE) {
			return Response.redirect(OFFLINE_PAGE, 302);
		}
		const offline = await caches.match(OFFLINE_PAGE);
		return offline ?? Response.error();
	}
}

async function localFile(
	id: string,
	path: string,
): Promise<{ file: File; mimeType: string | null } | null> {
	try {
		const root = await navigator.storage.getDirectory();
		let dir = await (
			await root.getDirectoryHandle(DOWNLOADS_DIR)
		).getDirectoryHandle(id);
		const parts = path.split("/");
		for (const part of parts.slice(0, -1)) {
			// biome-ignore lint/performance/noAwaitInLoops: walking a path is sequential
			dir = await dir.getDirectoryHandle(part);
		}
		const file = await (
			await dir.getFileHandle(parts.at(-1) as string)
		).getFile();
		let mimeType: string | null = null;
		if (path === "media") {
			const plan = await (await dir.getFileHandle(PLAN_FILE)).getFile();
			mimeType =
				(JSON.parse(await plan.text()) as { mimeType?: string }).mimeType ??
				null;
		}
		return { file, mimeType };
	} catch {
		return null;
	}
}

async function serveLocal(
	target: { id: string; path: string },
	request: Request,
): Promise<Response> {
	const found = await localFile(target.id, target.path);
	if (!found) {
		return new Response("Not downloaded.", { status: 404 });
	}
	const { file, mimeType } = found;
	const type = contentTypeFor(target.path, mimeType);
	const range = parseRange(request.headers.get("range"), file.size);
	if (range === "unsatisfiable") {
		return new Response(null, {
			status: 416,
			headers: { "content-range": `bytes */${file.size}` },
		});
	}
	if (range === null) {
		return new Response(file, {
			headers: {
				"content-type": type,
				"content-length": String(file.size),
				"accept-ranges": "bytes",
			},
		});
	}
	return new Response(file.slice(range.start, range.end + 1), {
		status: 206,
		headers: {
			"content-type": type,
			"content-length": String(range.end - range.start + 1),
			"content-range": `bytes ${range.start}-${range.end}/${file.size}`,
			"accept-ranges": "bytes",
		},
	});
}

sw.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") {
		return;
	}
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) {
		return;
	}
	const local = parseLocalMediaPath(url.pathname);
	if (local) {
		event.respondWith(serveLocal(local, request));
		return;
	}
	if (ASSET_SET.has(url.pathname)) {
		event.respondWith(fromCache(request));
		return;
	}
	if (url.pathname === OFFLINE_DATA) {
		event.respondWith(
			fetch(request).catch(
				async () =>
					(await caches.match(OFFLINE_DATA, { ignoreSearch: true })) ??
					Response.error(),
			),
		);
		return;
	}
	if (request.mode === "navigate") {
		event.respondWith(navigate(request));
	}
});
