import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const routes = [
	"/",
	"/discover",
	"/library",
	"/history",
	"/collections",
	"/settings",
	"/addons",
	"/search?q=breaking%20bad",
	"/detail/movie/tt0137523",
	"/detail/series/tt0903747",
	"/watch/movie/tt0137523",
];

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

for (const route of routes) {
	test(`renders without errors: ${route}`, async ({ page }) => {
		const errors = collectRuntimeErrors(page);

		const response = await page.goto(route);
		expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);
		await page.waitForLoadState("networkidle");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

		expect(errors, `runtime errors on ${route}`).toEqual([]);
	});
}

test("client-side navigation through the whole shell", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle");

	for (const label of ["Discover", "Library", "Collections"]) {
		await page
			.getByRole("navigation")
			.getByRole("link", { name: label, exact: true })
			.click();
		await page.waitForLoadState("networkidle");
		await expect(page.getByRole("heading", { name: label })).toBeVisible();
	}

	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Watch history" }).click();
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("heading", { name: "Watch history" }),
	).toBeVisible();

	expect(errors, "runtime errors during client navigation").toEqual([]);
});

test("detail page: add to library then remove", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	const initial = (await toggle.textContent())?.trim();
	await toggle.click();
	await expect(toggle).not.toHaveText(initial ?? "", { timeout: 10_000 });
	await toggle.click();
	await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });

	expect(errors, "runtime errors on detail toggle").toEqual([]);
});
