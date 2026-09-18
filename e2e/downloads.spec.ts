import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// The e2e account has no stream addon, so the harness (`/dev/downloads`) stands
// in for the sources drawer: the real button, manager, worker and service
// worker, pointed at the fixtures in `static/e2e/`.

async function download(page: Page, id: string, src: string): Promise<string> {
	await page.goto(`/dev/downloads?${new URLSearchParams({ src, id })}`);
	await page.getByRole("button", { name: "Download Sample" }).click();
	const done = page.locator(`[data-video="${id}"]`);
	await expect(done).toBeAttached({ timeout: 30_000 });
	return (await done.getAttribute("data-local")) as string;
}

/** Fetches through the page, so the service worker answers. */
function get(page: Page, url: string, range?: string) {
	return page.evaluate(
		async ([target, header]) => {
			const response = await fetch(target, {
				headers: header ? { range: header } : {},
			});
			const body = new Uint8Array(await response.arrayBuffer());
			return {
				status: response.status,
				type: response.headers.get("content-type"),
				size: body.byteLength,
				text: new TextDecoder().decode(body.slice(0, 2000)),
			};
		},
		[url, range] as const,
	);
}

test("downloads: a direct file and both HLS flavours, then offline", async ({
	page,
	context,
}) => {
	test.setTimeout(120_000);
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// The service worker serves `/offline-media/`: wait until it controls the page.
	await page.goto("/dev/downloads");
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
		)
		.toBe(true);

	// A direct file: whole, and by range (a <video> seeks with those).
	const file = await download(page, "e2e-file", "/e2e/sample.webm");
	const original = await get(page, "/e2e/sample.webm");
	const whole = await get(page, file);
	expect(whole).toMatchObject({ status: 200, size: original.size });
	expect(whole.type).toContain("video/webm");
	expect(await get(page, file, "bytes=0-9")).toMatchObject({
		status: 206,
		size: 10,
	});

	// HLS, MPEG-TS with an AES-128 key: the playlists point at local copies.
	const ts = await download(page, "e2e-ts", "/e2e/hls-ts/master.m3u8");
	expect((await get(page, ts)).text).toContain("video.m3u8");
	const base = ts.replace(/index\.m3u8$/, "");
	const media = await get(page, `${base}video.m3u8`);
	expect(media.text).toContain('URI="video-key-1.bin"');
	expect(media.text).toContain("video-seg-00001.ts");
	expect((await get(page, `${base}video-key-1.bin`)).size).toBe(
		(await get(page, "/e2e/hls-ts/v/key.bin")).size,
	);
	const segment = await get(page, `${base}video-seg-00001.ts`);
	expect(segment).toMatchObject({
		status: 200,
		size: (await get(page, "/e2e/hls-ts/v/seg00.ts")).size,
		type: "video/mp2t",
	});

	// HLS, fMP4: the initialisation segment comes along.
	const fmp4 = await download(page, "e2e-fmp4", "/e2e/hls-fmp4/index.m3u8");
	expect((await get(page, fmp4)).text).toContain(
		'#EXT-X-MAP:URI="video-init-1.mp4"',
	);
	const fmp4Base = fmp4.replace(/index\.m3u8$/, "");
	expect((await get(page, `${fmp4Base}video-init-1.mp4`)).size).toBe(
		(await get(page, "/e2e/hls-fmp4/init.mp4")).size,
	);

	// Offline: any navigation lands on the offline page, which plays downloads.
	await context.setOffline(true);
	try {
		await page.goto("/library");
		await expect(page).toHaveURL(/\/offline$/);
		await expect(
			page.getByRole("heading", { name: "You're offline" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Play Sample e2e-file" }).click();
		const video = page.locator("video");
		await expect(video).toBeVisible();
		await video.evaluate((element: HTMLVideoElement) => {
			element.muted = true;
			return element.play();
		});
		await expect
			.poll(() =>
				video.evaluate((element: HTMLVideoElement) => element.currentTime),
			)
			.toBeGreaterThan(0.5);
	} finally {
		await context.setOffline(false);
	}

	expect(errors).toEqual([]);
});
