import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("command palette: ⌘K jumps to a route", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	await page.keyboard.press("ControlOrMeta+k");

	const input = page.getByPlaceholder(/Jump to a page/);
	await expect(input).toBeVisible();

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

	await page.keyboard.press("ControlOrMeta+k");
	const input = page.getByPlaceholder(/Jump to a page/);
	await input.fill("interstellar");

	await page.getByRole("option", { name: /Search for/ }).click();

	await expect(page).toHaveURL(/\/search\?q=interstellar/);
	expect(errors, "runtime errors").toEqual([]);
});
