import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("collections: open a collection detail page", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/collections");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await expect(
		page.getByRole("heading", { name: "Collections" }),
	).toBeVisible();

	const firstCollection = page
		.getByRole("main")
		.getByRole("link", { name: /.+/ })
		.first();

	if (await firstCollection.isVisible().catch(() => false)) {
		await firstCollection.click();
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});
		// The detail page shows a back-to-collections control.
		await expect(
			page.getByRole("button", { name: "Collections" }),
		).toBeVisible();
		await page.waitForTimeout(500);
	}

	expect(errors, "runtime errors").toEqual([]);
});
