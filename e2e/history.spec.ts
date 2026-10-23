import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("watch history: direct load and client nav", async ({ page }) => {
	const errors = collectRuntimeErrors(page);
	// Account's sections live in the header's section row, like Settings.
	const historyLink = page
		.getByRole("navigation", { name: "Account sections" })
		.getByRole("link", { name: "Watch history" });

	await page.goto("/account/history");
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("heading", { name: "Watch history", level: 1 }),
	).toBeVisible();
	await expect(historyLink).toHaveAttribute("aria-current", "page");

	await page.goto("/discover");
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Account" }).click();
	await page.waitForLoadState("networkidle");
	await historyLink.click();
	await expect(page).toHaveURL(/\/account\/history$/);
	await expect(historyLink).toHaveAttribute("aria-current", "page");

	expect(errors, "runtime errors").toEqual([]);
});
