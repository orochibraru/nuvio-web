import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test("offline: any navigation lands on the downloads list", async ({
	page,
	context,
}) => {
	test.setTimeout(90_000);
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
		)
		.toBe(true);
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	await context.setOffline(true);
	try {
		// A client navigation: no "Failed to fetch" error page.
		await page.getByRole("link", { name: "Library" }).first().click();
		await expect(page).toHaveURL(/\/offline$/);
		await expect(
			page.getByRole("heading", { name: "You're offline" }),
		).toBeVisible();

		// A full load.
		await page.goto("/discover");
		await expect(page).toHaveURL(/\/offline$/);
		await expect(
			page.getByRole("heading", { name: "You're offline" }),
		).toBeVisible();
	} finally {
		await context.setOffline(false);
	}

	await page.waitForTimeout(500);
	expect(errors).toEqual([]);
});
