import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// The locale is a cookie on this browser (not an account setting), so the
// switch touches nothing shared with other specs.
test("i18n: switching to French re-renders the app in French, and back", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/settings");
	await page.getByRole("button", { name: "Français", exact: true }).click();

	await expect(page.locator("html")).toHaveAttribute("lang", "fr", {
		timeout: 15_000,
	});
	await expect(
		page.getByRole("link", { name: "Apparence", exact: true }).first(),
	).toBeVisible();

	await page.getByRole("button", { name: "English", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("lang", "en", {
		timeout: 15_000,
	});
	await expect(
		page.getByRole("link", { name: "Appearance", exact: true }).first(),
	).toBeVisible();

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});
