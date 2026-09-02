import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("watch history: direct load and client nav", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/account?tab=history");
	await page.waitForLoadState("networkidle");
	await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
	await expect(
		page.getByRole("tab", { name: "Watch history" }),
	).toHaveAttribute("aria-selected", "true");

	await page.goto("/discover");
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Account" }).click();
	await page.waitForLoadState("networkidle");
	await page.getByRole("tab", { name: "Watch history" }).click();
	await expect(page).toHaveURL(/tab=history/);

	expect(errors, "runtime errors").toEqual([]);
});
