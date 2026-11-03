import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("addons: Settings links to the browse page, which searches, filters and opens a details page", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/settings/addons");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("link", { name: /^Browse addons/ }).click();
	await expect(page).toHaveURL(/\/addons$/);
	await expect(
		page.getByRole("heading", { name: "Browse addons", level: 1 }),
	).toBeVisible();

	const cards = page.getByRole("main").getByRole("listitem").getByRole("link");
	await expect(cards.first()).toBeVisible({ timeout: 20_000 });

	const search = page.getByRole("searchbox", { name: "Search addons" });
	await search.fill("zzzz no such addon zzzz");
	await expect(page.getByText("No addon matches these filters.")).toBeVisible();
	await search.fill("");
	await expect(cards.first()).toBeVisible();

	await page.getByRole("button", { name: "Filters" }).click();
	const drawer = page.getByRole("dialog", { name: "Filters" });
	await drawer.getByRole("button", { name: /^Serves/ }).click();
	await drawer.getByRole("option", { name: "Subtitles" }).click();
	await expect(page).toHaveURL(/[?&]resource=subtitles/);
	await drawer.getByRole("button", { name: "Done" }).click();
	await expect(drawer).toBeHidden();

	await page.goto("/addons");
	await cards.first().click();
	await expect(page).toHaveURL(/\/addons\/[A-Za-z0-9_-]+$/);
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 20_000,
	});
	await expect(page.getByText("Manifest URL")).toBeVisible();
	await page.waitForTimeout(500);

	expect(errors, "runtime errors").toEqual([]);
});

test("addons: a details page for Cinemeta lists its catalogs", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	const id = Buffer.from("https://v3-cinemeta.strem.io/manifest.json").toString(
		"base64url",
	);

	await page.goto(`/addons/${id}`);
	await expect(
		page.getByRole("heading", { name: "Cinemeta", level: 1 }),
	).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByText("https://v3-cinemeta.strem.io/manifest.json"),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /\d+ catalogs?/ }),
	).toBeVisible();
	await page.waitForTimeout(500);

	expect(errors, "runtime errors").toEqual([]);
});

test("addons: an id that is not an addon URL is a 404", async ({ page }) => {
	const response = await page.goto("/addons/not-an-addon");
	expect(response?.status()).toBe(404);
});
