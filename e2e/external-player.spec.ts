import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const VIDEO_ID = "tt0903747:1:2";
const STREAM = "https://cdn.example/movie.mkv";

async function pickExternalPlayer(page: Page, label: string) {
	await page.goto("/settings?tab=playback");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("combobox", { name: "External player" }).click();
	await page.getByRole("option", { name: label }).click();
	await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
}

// iOS Safari decodes only a fraction of addon streams; with an external player
// picked in Settings, the player hands the source to that app instead of
// mounting <video>.
test("external player setting: the player hands the source to the picked app", async ({
	browser,
}) => {
	const context = await browser.newContext({ userAgent: IPHONE });
	await signIn(context);
	await context.addInitScript(
		([videoId, url]) => {
			sessionStorage.setItem(
				"nuvio:selected-stream",
				JSON.stringify({
					videoId,
					url,
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
		},
		[VIDEO_ID, STREAM],
	);
	const page = await context.newPage();
	const errors = collectRuntimeErrors(page);

	try {
		await pickExternalPlayer(page, "Infuse");

		await page.goto(`/player/series/${encodeURIComponent(VIDEO_ID)}`);
		await expect(page.getByText("Play in your external player")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("video")).toHaveCount(0);
		await expect(
			page.getByRole("link", { name: "Play in external player" }),
		).toHaveAttribute(
			"href",
			`infuse://x-callback-url/play?url=${encodeURIComponent(STREAM)}`,
		);
	} finally {
		await pickExternalPlayer(page, "None (play in the browser)");
	}

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
	await context.close();
});
