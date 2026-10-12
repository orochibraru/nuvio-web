import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// Needs no playable stream: the player's Back button renders whether or not a
// source resolves.
test("detail: Random episode opens the player on one of the show's episodes", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/series/tt0903747");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const random = page.getByRole("button", { name: "Random episode" });
	await expect(random).toBeVisible({ timeout: 20_000 });
	await random.click();

	await expect(page).toHaveURL(
		/\/player\/series\/tt0903747(%3A|:)[1-9]\d*(%3A|:)[1-9]\d*/,
		{ timeout: 15_000 },
	);
	await expect(page.getByRole("button", { name: "Back" }).first()).toBeVisible({
		timeout: 15_000,
	});

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});
