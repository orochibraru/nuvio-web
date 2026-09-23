import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

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
