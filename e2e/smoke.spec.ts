import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const routes = [
	"/",
	"/discover",
	"/library",
	"/collections",
	"/settings",
	"/settings?tab=playback",
	"/settings?tab=sync",
	"/settings?tab=addons",
	"/settings?tab=integrations",
	"/addons",
	"/account",
	"/account?tab=history",
	"/account?tab=stats",
	"/account?tab=storage",
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
		// A playing <video> keeps the network busy : bound the idle wait.
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		// Give late / async errors a beat to surface before we assert.
		await page.waitForTimeout(1000);

		expect(errors, `runtime errors on ${route}`).toEqual([]);
	});
}

test("settings: TheIntroDB key saves on blur and survives a reload", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/settings?tab=integrations");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const input = page.locator("#introdb-key");
	await expect(input).toBeVisible();
	// Normalise to empty regardless of what a prior run left : only blur
	// triggers a save, so this is a no-op (and no "Saved" toast) when a prior
	// run already left it empty.
	await input.fill("");
	await input.blur();

	await input.fill("e2e-test-key");
	await input.blur();
	await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });

	await page.reload();
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await expect(page.locator("#introdb-key")).toHaveValue("e2e-test-key");

	// Restore: clear what this test wrote.
	await page.locator("#introdb-key").fill("");
	await page.locator("#introdb-key").blur();
	await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });

	expect(errors, "runtime errors").toEqual([]);
});

test("client-side navigation through the whole shell", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle");

	await expect(page).toHaveTitle(/^Nuvio(\b|$)/);

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
	await page.getByRole("menuitem", { name: "Account" }).click();
	await page.waitForLoadState("networkidle");
	await expect(page).toHaveTitle("Nuvio · Account");
	await page.getByRole("tab", { name: "Watch history" }).click();
	await expect(page).toHaveURL(/tab=history/);

	expect(errors, "runtime errors during client navigation").toEqual([]);
});

// Regression: a navigation that interrupts an in-flight view transition used to
// leave the previous page painted over the new one (URL changed, content
// didn't). Start a debounced `goto` from the search box, then immediately
// navigate away and assert the destination renders.
test("interrupting a pending navigation still swaps the page", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/search");
	await page.waitForLoadState("networkidle");

	await page.getByRole("textbox").fill("inter");
	// Well inside the 450ms debounce : a /search?q= navigation is now pending.
	await page.waitForTimeout(150);
	await page
		.getByRole("navigation")
		.getByRole("link", { name: "Home", exact: true })
		.click();

	await expect(page).toHaveURL(/\/$/);
	await expect(page).toHaveTitle("Nuvio", { timeout: 10_000 });
	// The search box and its <h1> only exist on /search : gone once the page
	// component actually swapped.
	await expect(page.getByRole("textbox")).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Search", level: 1 }),
	).toHaveCount(0);

	expect(errors, "runtime errors").toEqual([]);
});

test("below md the nav collapses into a burger menu", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	// The inline nav links are hidden; the burger is the way through.
	await expect(
		page.getByRole("navigation").getByRole("link", { name: "Discover" }),
	).toBeHidden();

	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await page.getByRole("link", { name: "Discover" }).click();

	await expect(page).toHaveURL(/\/discover$/);
	await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("discover: catalog pills repaint the grid, even clicked back to back", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/discover");
	const posters = page.getByRole("link", { name: /\((movie|series)\)/ });
	await expect(posters.first()).toBeVisible({ timeout: 20_000 });

	// Each pill re-runs the load, which fetches that catalog's first page
	// server-side. Clicking the next one before the last settles aborts a
	// navigation : that used to escape as an uncaught "navigation aborted"
	// (and stranded the top loading bar), so the runtime-error assertion
	// below is the point of the rapid-fire loop.
	const pills = page
		.getByRole("group", { name: "Catalogs" })
		.getByRole("button");
	for (let i = 1; i < Math.min(await pills.count(), 4); i++) {
		await pills.nth(i).click();
		await expect(posters.first()).toBeVisible({ timeout: 20_000 });
	}
	await expect(page).toHaveURL(/[?&]c=/);

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});

test("search auto-runs while typing (debounced)", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/search");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	await page.getByPlaceholder("Search movies and series").fill("breaking bad");
	// No Enter : the debounced effect pushes the query into the URL itself.
	await expect(page).toHaveURL(/\/search\?q=breaking(%20|\+)bad/, {
		timeout: 5000,
	});
	await expect(
		page.getByRole("heading", { name: "Series", exact: true }),
	).toBeVisible({ timeout: 20_000 });

	expect(errors, "runtime errors").toEqual([]);
});

test("poster right-click menu: mark a movie watched, then unwatch", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// Fight Club is in the test account's baseline library. Reload until the
	// local store has hydrated the grid (it can briefly show an empty grid
	// while IDB / the delta pull settle).
	const poster = page.getByRole("link", { name: /Fight Club/i }).first();
	await expect(async () => {
		await page.goto("/library");
		await expect(poster).toBeVisible({ timeout: 8000 });
	}).toPass({ timeout: 40_000 });

	await poster.click({ button: "right" });
	const markWatched = page.getByRole("menuitem", { name: "Mark as watched" });
	await expect(markWatched).toBeVisible();
	await markWatched.click();

	await poster.click({ button: "right" });
	await expect(
		page.getByRole("menuitem", { name: "Mark as unwatched" }),
	).toBeVisible();
	await page.getByRole("menuitem", { name: "Mark as unwatched" }).click();

	expect(errors, "runtime errors").toEqual([]);
});

test("series poster + detail page offer a 'mark all watched' action", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// Search results always show Breaking Bad regardless of the account's own
	// library/watch state. Don't actually invoke the action : marking all ~62
	// episodes watched on the shared test account has no simple undo (unlike
	// the movie toggle above), so this only checks the affordance renders.
	await page.goto("/search?q=breaking%20bad");
	// Several movie results also contain "Breaking Bad" as a substring : match
	// the series card specifically via its aria-label's `(series)` suffix.
	const poster = page
		.getByRole("link", { name: /^Breaking Bad \(series\)/ })
		.first();
	await expect(poster).toBeVisible({ timeout: 8000 });

	await poster.click({ button: "right" });
	await expect(
		page.getByRole("menuitem", { name: "Mark all watched" }),
	).toBeVisible();
	await page.keyboard.press("Escape");

	await page.goto("/detail/series/tt0903747");
	await expect(
		page.getByRole("button", { name: "Mark all watched" }),
	).toBeVisible({ timeout: 15_000 });

	expect(errors, "runtime errors").toEqual([]);
});

test("library posters stay painted across a sync re-publish", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	const poster = page.getByRole("link", { name: /Fight Club/i }).first();
	await expect(async () => {
		await page.goto("/library");
		await expect(poster).toBeVisible({ timeout: 8000 });
	}).toPass({ timeout: 40_000 });

	// Wait for the poster image to actually paint (loaded → opacity 1).
	const img = poster.locator("img").first();
	await expect(img).toHaveCSS("opacity", "1", { timeout: 15_000 });
	expect(
		await img.evaluate((el: HTMLImageElement) => el.naturalWidth),
	).toBeGreaterThan(0);

	// A background delta pull re-publishes the store, which rebuilds every `item`
	// object in the grid and re-runs each poster's load effect. That effect used
	// to blank `loaded` : and since the cached <img> fires no fresh `load` event,
	// the poster stayed stuck behind its skeleton forever. Drive a pull by
	// toggling page visibility (the store syncs on `visibilitychange`).
	for (let i = 0; i < 2; i += 1) {
		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				value: "hidden",
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
			Object.defineProperty(document, "visibilityState", {
				value: "visible",
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await page.waitForTimeout(2500);
	}

	await expect(img).toHaveCSS("opacity", "1");
	await expect(poster.locator(".skeleton")).toHaveCount(0);

	expect(errors, "runtime errors").toEqual([]);
});

test("home hero carousel: manual step changes the featured title", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const next = page.getByRole("button", { name: "Next featured title" });
	// Only present when the load found >1 backdropped title : skip otherwise.
	if (await next.isVisible().catch(() => false)) {
		const heading = page.getByRole("group", { name: "Featured titles" });
		const before = await heading.textContent();
		await next.click();
		await expect.poll(() => heading.textContent()).not.toBe(before);
	}

	expect(errors, "runtime errors").toEqual([]);
});

test("continue-watching card: right-click menu + play/details targets", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const row = page.getByRole("heading", { name: "Continue watching" });
	if (!(await row.isVisible().catch(() => false))) {
		test.skip(true, "no continue-watching row for this account");
	}

	// First card in the row. Right-click a corner : the centred play button
	// intercepts pointer events over the middle.
	const card = row
		.locator("xpath=following-sibling::div[1]")
		.locator("a[href^='/detail/']")
		.first();
	await card.click({ button: "right", position: { x: 8, y: 8 } });

	// Menu offers all three actions.
	await expect(
		page.getByRole("menuitem", { name: /Play|Resume/ }),
	).toBeVisible();
	await expect(
		page.getByRole("menuitem", { name: "View details" }),
	).toBeVisible();
	await expect(
		page.getByRole("menuitem", { name: "Remove from row" }),
	).toBeVisible();

	await page.getByRole("menuitem", { name: "View details" }).click();
	await expect(page).toHaveURL(/\/detail\//);

	expect(errors, "runtime errors").toEqual([]);
});

test("detail page: add to library then remove", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	// Normalise to "not in library" regardless of what a prior run left.
	if ((await toggle.textContent())?.includes("Remove from library")) {
		await toggle.click();
		await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });
	}
	await toggle.click();
	await expect(toggle).toHaveText(/Remove from library/i, { timeout: 10_000 });
	await toggle.click();
	await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });

	expect(errors, "runtime errors on detail toggle").toEqual([]);
});

test("local store: an optimistic add shows on the library page after client nav", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// Interstellar : not part of the test account's baseline library.
	await page.goto("/detail/movie/tt0816692");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	// Start from "not in library" whatever a prior run left behind.
	if ((await toggle.textContent())?.includes("Remove from library")) {
		await toggle.click();
		await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });
	}
	await toggle.click();
	await expect(toggle).toHaveText(/Remove from library/i, { timeout: 10_000 });

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
	if ((await t2.textContent())?.includes("Remove from library")) {
		await t2.click();
		await expect(t2).toHaveText(/Add to library/i, { timeout: 10_000 });
	}

	expect(errors, "runtime errors").toEqual([]);
});
