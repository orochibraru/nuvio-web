import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * Opens the palette. Retries the shortcut: under a loaded suite the press can
 * land before hydration attaches the key listener, and a lost press is not the
 * bug this spec is about.
 */
async function openPalette(page: Page) {
	const input = page.getByPlaceholder(/Jump to a page/);
	await expect(async () => {
		await page.keyboard.press("ControlOrMeta+k");
		await expect(input).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
	return input;
}

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("command palette: ⌘K jumps to a route", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const input = await openPalette(page);

	await input.fill("addons");
	await page.getByRole("option", { name: "Addons", exact: true }).click();

	await expect(page.getByRole("heading", { name: "Addons" })).toBeVisible();
	expect(errors, "runtime errors").toEqual([]);
});

test("command palette: an unmatched query offers a title search", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const input = await openPalette(page);
	await input.fill("interstellar");

	await page.getByRole("option", { name: /Search for/ }).click();

	await expect(page).toHaveURL(/\/search\?q=interstellar/);
	expect(errors, "runtime errors").toEqual([]);
});
