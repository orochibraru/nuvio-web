import { devices, expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// On a phone, what a desktop shows as a dropdown or a side drawer is a page
// or a bottom sheet, like an app.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("the Profile tab opens the account page, whose cards drill into a section", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: /Profile/ })
		.click();

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
	// Each group is a combobox: one row, opened in place.
	await drawer.getByRole("button", { name: /^Show/ }).click();
	await drawer.getByRole("option", { name: "Movies" }).click();
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

	// Regression: the sheet's own dismiss didn't clear the panel, so the
	// button set the same state again and nothing reopened.
	await page.getByRole("button", { name: "Select stream" }).click();
	await expect(sheet).toBeVisible();
	await page.mouse.click(195, 40);
	await expect(sheet).toBeHidden();
	await page.getByRole("button", { name: "Select stream" }).click();
	await expect(sheet).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("a long press opens a poster's actions in a bottom sheet", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/library");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	// A phone's long press reaches the same `contextmenu` handler.
	const poster = page.locator('main a[href^="/detail/"]').first();
	await poster.click({ button: "right" });

	const sheet = page.getByRole("dialog");
	await expect(
		sheet.getByRole("button", { name: "View details" }),
	).toBeVisible();
	// No desktop context menu alongside it.
	await expect(page.getByRole("menu")).toHaveCount(0);
	await sheet.getByRole("button", { name: "View details" }).click();
	await expect(page).toHaveURL(/\/detail\//);

	expect(errors, "runtime errors").toEqual([]);
});

test("a second tap on the Search tab focuses the box", async ({ browser }) => {
	// A real touch phone: the search page only focuses its box on load where a
	// keyboard costs nothing, so the first tap mustn't pop it.
	const context = await browser.newContext({ ...devices["Pixel 7"] });
	await signIn(context);
	const page = await context.newPage();
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	const search = page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Search" });
	await search.tap();
	await expect(page).toHaveURL(/\/search$/);
	const box = page.getByPlaceholder("Search movies and series");
	await expect(box).not.toBeFocused();

	await search.tap();
	await expect(box).toBeFocused();

	expect(errors, "runtime errors").toEqual([]);
	await context.close();
});

test("search filters open in a drawer and live in the URL", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/search");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("button", { name: "Filters" }).click();

	const drawer = page.getByRole("dialog", { name: "Filters" });
	await drawer.getByRole("button", { name: /^Type/ }).click();
	await drawer.getByRole("option", { name: "Movies" }).click();
	await expect(page).toHaveURL(/[?&]type=movie/);
	await drawer.getByRole("button", { name: /^Type/ }).click();
	await drawer.getByRole("option", { name: "All", exact: true }).click();
	await expect(page).toHaveURL(/\/search$/);
	await drawer.getByRole("button", { name: "Done" }).click();
	await expect(drawer).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});
