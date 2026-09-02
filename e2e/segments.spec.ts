import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";

// Intro / outro (TheIntroDB) affordances, driven through the `/dev/player`
// harness : the shared test account has no stream addon, so the real player
// route can't resolve a video.
const SAMPLE = "/e2e/sample.webm";

test("skip intro button seeks past the intro window", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	// sample.webm is ~7.8s; intro window 2s-5s.
	await page.goto(`/dev/player?src=${SAMPLE}&introStart=2&introEnd=5`);
	await page.waitForLoadState("networkidle");

	await page.evaluate(() => {
		const v = document.querySelector("video");
		if (v) {
			v.currentTime = 3;
			void v.play().catch(() => { });
		}
	});

	const skip = page.getByRole("button", { name: "Skip intro" });
	await expect(skip).toBeVisible({ timeout: 5000 });

	await page.evaluate(() => document.querySelector("video")?.pause());
	await skip.click();

	const after = await page.evaluate(
		() => document.querySelector("video")?.currentTime ?? 0,
	);
	expect(after).toBeGreaterThanOrEqual(5);
	await expect(skip).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});

test("reaching the outro fires the handoff and minimizes the player", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(`/dev/player?src=${SAMPLE}&outroStart=3`);
	await page.waitForLoadState("networkidle");

	await page.evaluate(() => {
		const v = document.querySelector("video");
		if (v) {
			void v.play().catch(() => { });
			v.currentTime = 4;
		}
	});

	await expect(page.getByTestId("outro")).toHaveText("outro", {
		timeout: 5000,
	});
	// Minimized: the player region shrinks to a fixed box in the top-left corner.
	await expect(page.getByRole("region", { name: "Video player" })).toHaveClass(
		/fixed.*top-4.*left-4/,
		{ timeout: 3000 },
	);

	expect(errors, "runtime errors").toEqual([]);
});

test("end-of-show panel: minimized player + suggestions + go-back", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(`/dev/player?endofshow=1&src=${SAMPLE}`);
	await page.waitForLoadState("networkidle");

	await expect(
		page.getByText(/these titles could interest you/i),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "The Dev Harness Movie" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Suggested Title 1" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();

	// The player is minimized to the top-left corner behind the panel.
	await expect(page.getByRole("region", { name: "Video player" })).toHaveClass(
		/fixed.*top-4.*left-4/,
	);

	await page.waitForTimeout(300);
	expect(errors, "runtime errors").toEqual([]);
});
