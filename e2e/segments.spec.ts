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
			void v.play().catch(() => {});
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
			void v.play().catch(() => {});
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

// Chapters : read from the file's own container metadata in the browser
// (Range requests, never through the server), else the intro / credits
// segments stand in.
async function hoverScrubAt(
	page: import("@playwright/test").Page,
	ratio: number,
) {
	const player = page.getByRole("region", { name: "Video player" });
	await player.hover();
	const track = player.getByRole("slider", { name: "Seek" });
	const box = await track.boundingBox();
	if (!box) {
		throw new Error("no seek bar");
	}
	await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
}

test("embedded chapters label the scrub bar", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	// chapters.webm is sample.webm (~7.8s) with Opening 0s, Middle 3s, Ending 6s.
	await page.goto("/dev/player?src=/e2e/chapters.webm");
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.querySelector("video")?.pause());

	await hoverScrubAt(page, 0.55);
	await expect(page.getByText("Middle", { exact: true })).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("intro / credits segments stand in for a file without chapters", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(
		`/dev/player?src=${SAMPLE}&introStart=2&introEnd=5&outroStart=7`,
	);
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.querySelector("video")?.pause());

	await hoverScrubAt(page, 0.45);
	await expect(page.getByText("Intro", { exact: true })).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("volume boost routes through Web Audio and shows its level", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(`/dev/player?src=${SAMPLE}`);
	await page.waitForLoadState("networkidle");

	const player = page.getByRole("region", { name: "Video player" });
	await player.hover();
	await player.getByRole("button", { name: "Settings" }).click();
	await page.getByRole("menuitemradio", { name: "200%" }).click();

	await expect(player.getByText("200%", { exact: true })).toBeVisible();
	// Same-origin file : boosted without a CORS reload, still playing.
	await expect
		.poll(() =>
			page.evaluate(() => {
				const v = document.querySelector("video");
				return v ? !v.paused && v.crossOrigin === null : false;
			}),
		)
		.toBe(true);

	expect(errors, "runtime errors").toEqual([]);
});
