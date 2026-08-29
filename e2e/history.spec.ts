import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("watch history: direct load and client nav", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/history");
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("heading", { name: "Watch history" }),
	).toBeVisible();

	await page.goto("/discover");
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Watch history" }).click();
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("heading", { name: "Watch history" }),
	).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});
