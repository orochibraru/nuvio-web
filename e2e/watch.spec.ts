import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// Committed VP8/WebM sample (~7.8s) — Playwright's Chromium has no H.264, and a
// local file keeps the test off the network.
const SAMPLE = "/e2e/sample.webm";

function harness(params: Record<string, string> = {}): string {
	return `/dev/player?${new URLSearchParams({ src: SAMPLE, ...params }).toString()}`;
}

function currentTime(page: Page): Promise<number> {
	return page.evaluate(() => document.querySelector("video")?.currentTime ?? 0);
}

test("detail source sidebar: opens, resolves async, refreshes, closes", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// tt1375666 (Inception) — no watch progress, so the play button is "Watch".
	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const url = page.url();
	await page.getByRole("button", { name: "Watch", exact: true }).click();

	const panel = page.getByRole("complementary");
	await expect(panel.getByText("Sources").first()).toBeVisible();
	await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
	// The drawer is module state, not a URL param — opening it must not navigate.
	expect(page.url()).toBe(url);

	// Test account has only Cinemeta (no stream addon) → resolves to empty.
	// The addon fan-out can be slow under a cold cache, so give it room.
	await expect(panel.getByText("No streams yet")).toBeVisible({
		timeout: 30_000,
	});
	await panel.getByRole("button", { name: "Refresh" }).click();
	await expect(panel.getByText("No streams yet")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(panel).toBeHidden();
	expect(page.url()).toBe(url);

	expect(errors).toEqual([]);
});

test("detail page warms the stream fan-out before the drawer opens", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	let resolvedStreamsRequested = false;
	page.on("request", (request) => {
		if (request.url().includes("resolveStreams")) {
			resolvedStreamsRequested = true;
		}
	});

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	// The preload kicks off ~700ms after meta loads — never touching the drawer.
	await expect
		.poll(() => resolvedStreamsRequested, { timeout: 6000 })
		.toBe(true);

	expect(errors).toEqual([]);
});

test("detail: mark a movie watched, then unwatch", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const mark = page.getByRole("button", { name: /Mark watched|Watched/ });
	if ((await mark.textContent())?.includes("Watched")) {
		await mark.click();
		await expect(mark).toHaveText(/Mark watched/, { timeout: 10_000 });
	}
	await mark.click();
	await expect(mark).toHaveText(/Watched/, { timeout: 10_000 });
	await mark.click();
	await expect(mark).toHaveText(/Mark watched/, { timeout: 10_000 });

	expect(errors).toEqual([]);
});

test("player page with no resolvable stream renders cleanly", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);
	// tt0000001 — an 1894 short; addons have at most a non-web-playable source.
	await page.goto("/player/movie/tt0000001");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	// Either "No playable stream" or "This source can't play in the browser".
	await expect(
		page.getByRole("button", { name: "Choose a source" }),
	).toBeVisible({ timeout: 20_000 });
	// A back button must always be reachable while no stream is loaded.
	await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
	await page.waitForTimeout(1000);
	expect(errors).toEqual([]);
});

test("video player: autoplay, keyboard seek, speed menu", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness());
	await page.waitForLoadState("networkidle");

	const player = page.getByRole("region", { name: "Video player" });
	await expect(player).toBeVisible();

	// The player autoplays; the loading treatment clears once it's running.
	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(0.4);
	await page.evaluate(() => document.querySelector("video")?.pause());

	// keyboard nudge — the clip is short, so just confirm the direction of change
	await page.evaluate(() => {
		const video = document.querySelector("video");
		if (video) {
			video.currentTime = 0.5;
		}
	});
	await page.keyboard.press("ArrowRight");
	await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
	await page.keyboard.press("ArrowLeft");
	await expect.poll(() => currentTime(page)).toBeLessThan(1);

	await player.getByRole("button", { name: "Settings" }).click();
	await player.getByRole("button", { name: "1.5×" }).click();
	const rate = await page.evaluate(
		() => document.querySelector("video")?.playbackRate ?? 0,
	);
	expect(rate).toBe(1.5);

	expect(errors, "runtime errors").toEqual([]);
});

test("player seeks to startTime and leaves cleanly", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness({ start: "5" }));
	await page.waitForLoadState("networkidle");

	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(4.5);

	await page.goto("/dev/player");
	await page.waitForLoadState("networkidle");
	expect(errors, "runtime errors leaving the player").toEqual([]);
});

test("player episode drawer: season switcher + jump to another episode", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/player/series/tt0903747:1:1");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const episodesButton = page.getByRole("button", { name: "Episodes" });
	// Needs a browser-playable stream from the test account's addons — skip if none.
	if (!(await episodesButton.isVisible().catch(() => false))) {
		test.skip(true, "no web-playable stream resolved for the drawer test");
	}

	await episodesButton.click();
	const drawer = page.getByRole("complementary", { name: "Episodes" });
	await expect(drawer).toBeVisible();
	await expect(drawer.getByText("Now")).toBeVisible();

	// Switch season, then open an episode from it.
	await drawer.getByRole("button", { name: "Season 2" }).click();
	await drawer.getByRole("button", { name: /^1\./ }).click();
	await expect(page).toHaveURL(/tt0903747(%3A|:)2(%3A|:)1/);
	await expect(drawer).toBeHidden();

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});
