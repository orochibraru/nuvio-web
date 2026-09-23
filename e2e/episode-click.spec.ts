import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// Clicks through, rather than `page.goto`, so a stall in the client router or
// the episode card itself fails here. Needs no playable stream: the player's
// Back button renders whether or not a source resolves.
test("detail: clicking an episode card opens the player", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/series/tt0903747");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	// The carousel opens on the resume season when there is one.
	const seasonOne = page.getByRole("button", { name: "Season 1", exact: true });
	await expect(seasonOne).toBeVisible({ timeout: 20_000 });
	await seasonOne.click();

	await page.getByRole("link", { name: /^E2\b/ }).first().click();

	await expect(page).toHaveURL(/\/player\/series\/tt0903747(%3A|:)1(%3A|:)2/, {
		timeout: 15_000,
	});
	await expect(page.getByRole("button", { name: "Back" }).first()).toBeVisible({
		timeout: 15_000,
	});

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});
