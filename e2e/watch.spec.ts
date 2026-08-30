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

test("streams page: instant shell, async list, refresh", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);
	await page.goto("/streams/movie/tt0137523");

	// The heading paints from SSR before streams resolve.
	await expect(
		page.getByRole("heading", { name: "Fight Club", level: 1 }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

	await page.waitForLoadState("networkidle");
	// Test account has only Cinemeta (no stream addon) → resolves to empty.
	await expect(page.getByText("No streams yet")).toBeVisible({
		timeout: 15_000,
	});
	await page.getByRole("button", { name: "Refresh" }).click();
	await expect(page.getByText("No streams yet")).toBeVisible();

	expect(errors).toEqual([]);
});

test("player page with no resolvable stream renders cleanly", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);
	await page.goto("/player/movie/tt0137523");
	await page.waitForLoadState("networkidle");
	await expect(page.getByText("No playable stream")).toBeVisible({
		timeout: 15_000,
	});
	await expect(
		page.getByRole("button", { name: "Choose a source" }),
	).toBeVisible();
	expect(errors).toEqual([]);
});

test("video player: play, keyboard seek, speed menu", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness());
	await page.waitForLoadState("networkidle");

	const player = page.getByRole("region", { name: "Video player" });
	await expect(player).toBeVisible();
	await player
		.getByRole("button", { name: "Play", exact: true })
		.first()
		.click();

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
