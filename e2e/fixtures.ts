import { readFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";

const STATIC_DIR = new URL("../static", import.meta.url).pathname;

const TYPES: Record<string, string> = {
	webm: "video/webm",
	mkv: "video/x-matroska",
	mp4: "video/mp4",
	m3u8: "application/vnd.apple.mpegurl",
	ts: "video/mp2t",
	m4s: "video/iso.segment",
	srt: "text/plain; charset=utf-8",
	vtt: "text/vtt",
};

/**
 * Serves `static/e2e/` from disk with `Range` support. The compiled
 * adapter-bun binary answers every `Range` on an embedded file with the whole
 * file and a 200, so a `<video>` on a fixture can't seek. Remove once
 * adapter-bun honours `Range` on embedded assets.
 */
export async function serveFixtures(context: BrowserContext): Promise<void> {
	await context.route(
		(url) => url.pathname.startsWith("/e2e/"),
		async (route) => {
			const { pathname } = new URL(route.request().url());
			const body = await readFile(STATIC_DIR + decodeURIComponent(pathname));
			const extension = pathname.split(".").at(-1) ?? "";
			const headers: Record<string, string> = {
				"content-type": TYPES[extension] ?? "application/octet-stream",
				"accept-ranges": "bytes",
			};

			const [, first = "", last = ""] =
				// biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns null on no match (Biome 2.5.14 infers it as non-null; TypeScript does not)
				/^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range ?? "") ?? [];
			if (first === "" && last === "") {
				await route.fulfill({ status: 200, headers, body });
				return;
			}
			const size = body.length;
			const start =
				first === "" ? Math.max(0, size - Number(last)) : Number(first);
			const end =
				first === "" || last === ""
					? size - 1
					: Math.min(Number(last), size - 1);
			if (start >= size || start > end) {
				headers["content-range"] = `bytes */${size}`;
				await route.fulfill({ status: 416, headers });
				return;
			}
			headers["content-range"] = `bytes ${start}-${end}/${size}`;
			await route.fulfill({
				status: 206,
				headers,
				body: body.subarray(start, end + 1),
			});
		},
	);
}
