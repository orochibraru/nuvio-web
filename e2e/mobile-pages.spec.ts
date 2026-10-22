import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// On a phone, what a desktop shows as a dropdown or a side drawer is a page
// or a bottom sheet, like an app.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("avatar opens the account page, whose cards drill into a section", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("link", { name: "Profile menu" }).click();

	await expect(page).toHaveURL(/\/account$/);
	await expect(
		page.getByRole("link", { name: /^Switch profile/ }),
	).toBeVisible();
	await page.getByRole("link", { name: /^Stats/ }).click();
	await expect(page).toHaveURL(/\/account\?tab=stats$/);
	await expect(
		page.getByRole("heading", { name: "Stats", level: 1 }),
	).toBeVisible();

	await page
		.getByRole("link", { name: "Account", exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/\/account$/);

	expect(errors, "runtime errors").toEqual([]);
});

test("library filters live in a bottom drawer", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/library");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("button", { name: "Filters" }).click();

	const drawer = page.getByRole("dialog", { name: "Filters" });
	await expect(drawer).toBeVisible();
	await drawer.getByRole("button", { name: "Movies" }).click();
	await expect(page).toHaveURL(/[?&]filter=movie/);
	await drawer.getByRole("button", { name: "Done" }).click();
	await expect(drawer).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});

test("a title's sources open in a bottom sheet", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt0137523");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	const url = page.url();
	await page.getByRole("button", { name: "Select stream" }).click();

	const sheet = page.getByRole("dialog", { name: "Sources" });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByText("No addon streams")).toBeVisible({
		timeout: 30_000,
	});
	// Module state, not a route : opening it never navigates.
	expect(page.url()).toBe(url);
	await page.keyboard.press("Escape");
	await expect(sheet).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});
