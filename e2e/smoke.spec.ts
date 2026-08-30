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
	"/account",
	"/support",
	"/search?q=breaking%20bad",
	"/detail/movie/tt0137523",
	"/detail/series/tt0903747",
	"/player/movie/tt0137523",
	"/player/series/tt0903747:1:1",
];

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

for (const route of routes) {
	test(`renders without errors: ${route}`, async ({ page }) => {
		const errors = collectRuntimeErrors(page);

		const response = await page.goto(route);
		expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);
		// A playing <video> keeps the network busy — bound the idle wait.
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		// Give late / async errors a beat to surface before we assert.
		await page.waitForTimeout(1000);

		expect(errors, `runtime errors on ${route}`).toEqual([]);
	});
}

test("client-side navigation through the whole shell", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle");

	await expect(page).toHaveTitle("Nuvio");

	for (const label of ["Discover", "Library", "Collections"]) {
		await page
			.getByRole("navigation")
			.getByRole("link", { name: label, exact: true })
			.click();
		await page.waitForLoadState("networkidle");
		await expect(page.getByRole("heading", { name: label })).toBeVisible();
		await expect(page).toHaveTitle(`Nuvio · ${label}`);
	}

	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Watch history" }).click();
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("heading", { name: "Watch history" }),
	).toBeVisible();
	await expect(page).toHaveTitle("Nuvio · Watch history");

	expect(errors, "runtime errors during client navigation").toEqual([]);
});

test("search auto-runs while typing (debounced)", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/search");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	await page.getByPlaceholder("Search movies and series").fill("breaking bad");
	// No Enter — the debounced effect pushes the query into the URL itself.
	await expect(page).toHaveURL(/\/search\?q=breaking(%20|\+)bad/, {
		timeout: 5000,
	});
	await expect(
		page.getByRole("heading", { name: "Series", exact: true }),
	).toBeVisible({ timeout: 20_000 });

	expect(errors, "runtime errors").toEqual([]);
});

test("home hero carousel: manual step changes the featured title", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const next = page.getByRole("button", { name: "Next featured title" });
	// Only present when the load found >1 backdropped title — skip otherwise.
	if (await next.isVisible().catch(() => false)) {
		const heading = page.getByRole("group", { name: "Featured titles" });
		const before = await heading.textContent();
		await next.click();
		await expect.poll(() => heading.textContent()).not.toBe(before);
	}

	expect(errors, "runtime errors").toEqual([]);
});

test("detail page: add to library then remove", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	// Normalise to "not in library" regardless of what a prior run left.
	if ((await toggle.textContent())?.includes("In library")) {
		await toggle.click();
		await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });
	}
	await toggle.click();
	await expect(toggle).toHaveText(/In library/i, { timeout: 10_000 });
	await toggle.click();
	await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });

	expect(errors, "runtime errors on detail toggle").toEqual([]);
});

test("local store: an optimistic add shows on the library page after client nav", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// Interstellar — not part of the test account's baseline library.
	await page.goto("/detail/movie/tt0816692");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	// Start from "not in library" whatever a prior run left behind.
	if ((await toggle.textContent())?.includes("In library")) {
		await toggle.click();
		await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });
	}
	await toggle.click();
	await expect(toggle).toHaveText(/In library/i, { timeout: 10_000 });

	await page
		.getByRole("navigation")
		.getByRole("link", { name: "Library" })
		.click();
	await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
	// No reload: the row is present purely from the local store.
	await expect(
		page.getByRole("link", { name: /Interstellar/i }).first(),
	).toBeVisible({ timeout: 10_000 });

	// Restore: remove what this test added.
	await page.goto("/detail/movie/tt0816692");
	await page.waitForLoadState("networkidle");
	const t2 = page.getByRole("button", { name: /library/i });
	if ((await t2.textContent())?.includes("In library")) {
		await t2.click();
		await expect(t2).toHaveText(/Add to library/i, { timeout: 10_000 });
	}

	expect(errors, "runtime errors").toEqual([]);
});
