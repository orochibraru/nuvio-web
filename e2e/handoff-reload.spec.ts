import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { serveFixtures } from "./fixtures.ts";

test.beforeEach(({ context }) => serveFixtures(context));

const VIDEO_ID = "tt0903747:1:2";

// The source picked in the drawer survives a player reload through
// sessionStorage only. Reading it back used to write `$state` from inside the
// player's `$derived` (`PlaybackHandoff.take`), the suspected cause of the
// client-side "Whoops!" error. The stored pick points at a local fixture, so no
// addon has to resolve anything.
test("player: a reload keeps the picked source, without runtime errors", async ({
	page,
	context,
}) => {
	await signIn(context);
	await context.addInitScript((videoId) => {
		sessionStorage.setItem(
			"nuvio:selected-stream",
			JSON.stringify({
				videoId,
				url: "/e2e/sample.webm",
				externalUrl: null,
				notWebReady: false,
				label: "E2E sample",
				addonName: "E2E",
				infoHash: null,
				audioRisky: false,
				videoRisky: false,
				videoCodec: null,
			}),
		);
	}, VIDEO_ID);
	const errors = collectRuntimeErrors(page);

	const player = `/player/series/${encodeURIComponent(VIDEO_ID)}`;
	await page.goto(player);
	await page.reload();

	await expect(page.locator("video")).toHaveAttribute("src", /sample\.webm/, {
		timeout: 15_000,
	});
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});

// The URL names the playing stream and the position, so a reload needs nothing
// from the tab's sessionStorage : the case a hard reload in a fresh tab hits.
test("player: the URL carries the stream and the position across a reload", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	const player = `/player/series/${encodeURIComponent(VIDEO_ID)}`;
	await page.goto(player);
	await page.evaluate((videoId) => {
		sessionStorage.setItem(
			"nuvio:selected-stream",
			JSON.stringify({
				videoId,
				url: "/e2e/sample.webm",
				externalUrl: null,
				notWebReady: false,
				label: "E2E sample",
				addonName: "E2E",
				infoHash: null,
				audioRisky: false,
				videoRisky: false,
				videoCodec: null,
			}),
		);
	}, VIDEO_ID);
	await page.reload();
	await expect(page.locator("video")).toHaveAttribute("src", /sample\.webm/, {
		timeout: 15_000,
	});
	await expect(page).toHaveURL(/[?&]stream=/);
	// A pause only fires (and flushes) once playback has actually started.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const video = document.querySelector("video");
					return Boolean(video && !video.paused && video.currentTime > 0);
				}),
			{ timeout: 15_000 },
		)
		.toBe(true);

	// Seek, then pause : a pause flushes progress, which writes the position.
	await page.evaluate(() => {
		const video = document.querySelector("video");
		if (video) {
			video.currentTime = 4;
			video.pause();
		}
	});
	await expect(page).toHaveURL(/[?&]t=4/);

	await page.evaluate(() => sessionStorage.clear());
	await page.reload();
	await expect(page.locator("video")).toHaveAttribute("src", /sample\.webm/, {
		timeout: 15_000,
	});
	await expect
		.poll(() =>
			page.evaluate(() => document.querySelector("video")?.currentTime ?? 0),
		)
		.toBeGreaterThanOrEqual(4);
	expect(errors, "runtime errors").toEqual([]);
});
