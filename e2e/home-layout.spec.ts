import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * Settings → Home: hiding a catalog takes its row off the home screen. Resets
 * the layout afterwards : the e2e account is shared, and a leftover layout
 * would change what every other spec's home page shows.
 */

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

async function resetLayout(page: import("@playwright/test").Page) {
	await page.goto("/settings?tab=home");
	const reset = page.getByRole("button", { name: "Reset" });
	if (await reset.isVisible().catch(() => false)) {
		await reset.click();
		await expect(reset).toBeHidden();
	}
}

test("home layout: a hidden catalog leaves the home screen", async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = collectRuntimeErrors(page);

	try {
		await resetLayout(page);
		const list = page.getByRole("list", { name: "Home catalogs, in order" });
		await expect(list).toBeVisible({ timeout: 20_000 });

		// The first catalog is on Home by default; turn it off.
		const first = list.getByRole("listitem").first();
		const name = (await first.locator("p").first().innerText()).trim();
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name, exact: true }).first(),
		).toBeVisible({
			timeout: 20_000,
		});

		await page.goto("/settings?tab=home");
		await page.getByRole("switch", { name: `Show ${name} on Home` }).click();
		await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();

		await page.goto("/");
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});
		// Another catalog's row has rendered, so the rows are in.
		await expect(page.locator("main h2").nth(1)).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
			0,
		);
	} finally {
		await resetLayout(page);
	}

	expect(errors, "runtime errors").toEqual([]);
});
