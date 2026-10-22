import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

// Discover's catalog and genre choices live in the app's filter drawer: each a
// combobox row that opens in place.
async function openGroup(page: Page, title: RegExp) {
	const drawer = page.getByRole("dialog", { name: "Filters" });
	if (!(await drawer.isVisible())) {
		await page.getByRole("button", { name: "Filters" }).click();
	}
	await drawer.getByRole("button", { name: title }).click();
	return drawer.getByRole("listbox");
}

test("discover: picking a catalog lands on it and repaints the grid", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");

	const posters = page.getByRole("link", { name: /\((movie|series)\)/ });
	await expect(posters.first()).toBeVisible({ timeout: 20_000 });
	// The whole list, not just the first title : two catalogs of the same type
	// often lead with the same film even though the rest differs.
	const titles = () =>
		posters.evaluateAll((links) =>
			links.map((link) => link.getAttribute("aria-label")).join("|"),
		);
	const before = await titles();

	const catalogs = await openGroup(page, /^Catalogs/);
	await catalogs.getByRole("option").nth(2).click();
	await expect(page).toHaveURL(/[?&]c=/);
	await page.getByRole("button", { name: "Done" }).click();
	await expect.poll(titles, { timeout: 20_000 }).not.toBe(before);

	expect(errors, "runtime errors").toEqual([]);
});

test("discover: picking a genre lands on it, and All clears it", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");
	await expect(
		page.getByRole("link", { name: /\((movie|series)\)/ }).first(),
	).toBeVisible({ timeout: 20_000 });

	let genres = await openGroup(page, /^Genres/);
	const option = genres.getByRole("option").nth(1);
	const label = (await option.textContent())?.trim() ?? "";
	await option.click();
	await expect
		.poll(() => new URL(page.url()).searchParams.get("g"), {
			timeout: 10_000,
		})
		.toBe(label);

	genres = await openGroup(page, /^Genres/);
	await genres.getByRole("option").first().click();
	await expect
		.poll(() => new URL(page.url()).searchParams.get("g"), { timeout: 10_000 })
		.toBeNull();

	expect(errors, "runtime errors").toEqual([]);
});
