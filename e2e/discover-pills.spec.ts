import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

const catalogPills = (page: import("@playwright/test").Page) =>
	page.getByRole("group", { name: "Catalogs" }).getByRole("link");
const genrePills = (page: import("@playwright/test").Page) =>
	page.getByRole("group", { name: "Genres" }).getByRole("link");

/**
 * Catalog / genre pills are plain links, not buttons driving `goto`. That is
 * what makes them preload on hover, survive a second click landing mid-flight,
 * and open in a new tab : clicking one used to drop the navigation outright
 * whenever it arrived before the previous one had round-tripped.
 */
test("discover: pills are links, and each click lands on the pill clicked", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");

	const pills = catalogPills(page);
	await expect(pills.first()).toBeVisible({ timeout: 20_000 });

	const count = Math.min(await pills.count(), 6);
	expect(count, "catalog pills").toBeGreaterThan(1);

	for (let i = 0; i < count; i++) {
		const href = await pills.nth(i).getAttribute("href");
		const expected = new URL(href ?? "", page.url()).searchParams.get("c");
		await pills.nth(i).click();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("c"), {
				timeout: 10_000,
			})
			.toBe(expected);
		// The clicked pill is the highlighted one once the navigation settles.
		await expect(pills.nth(i)).toHaveAttribute("aria-current", "true");
	}

	expect(errors, "runtime errors").toEqual([]);
});

test("discover: back-to-back clicks all land, last one wins", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");

	const pills = catalogPills(page);
	await expect(pills.first()).toBeVisible({ timeout: 20_000 });
	const count = Math.min(await pills.count(), 6);

	// No settle between clicks: a superseded navigation must not strand the URL
	// on the previous catalog.
	let expected: string | null = null;
	for (let round = 0; round < 3; round++) {
		for (let i = 0; i < count; i++) {
			const href = await pills.nth(i).getAttribute("href");
			expected = new URL(href ?? "", page.url()).searchParams.get("c");
			await pills.nth(i).click();
		}
	}

	await expect
		.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: 15_000 })
		.toBe(expected);

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});

test("discover: a catalog switch actually repaints the grid", async ({
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

	// Pills are links now, so the load re-runs off the URL change alone : no
	// `refreshAll` doing it by hand.
	const pills = catalogPills(page);
	await pills.nth(2).click();
	await expect.poll(titles, { timeout: 20_000 }).not.toBe(before);

	expect(errors, "runtime errors").toEqual([]);
});

test("discover: the clicked pill highlights before the load returns", async ({
	page,
}) => {
	await page.goto("/discover");
	const pills = catalogPills(page);
	await expect(pills.first()).toBeVisible({ timeout: 20_000 });

	// Hold the load's data response so the gap between click and commit is
	// wide and deterministic. Without the optimistic highlight the pill sits
	// unstyled for the whole round trip, which is what read as "it did nothing".
	await page.route("**/*__data.json*", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		await route.continue();
	});

	const target = pills.nth(3);
	await target.click({ noWaitAfter: true });
	await expect(target).toHaveAttribute("aria-current", "true", {
		timeout: 1000,
	});
	await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("discover: genre pills land on the genre clicked", async ({ page }) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");

	const genres = genrePills(page);
	await expect(genres.first()).toBeVisible({ timeout: 20_000 });
	const count = Math.min(await genres.count(), 5);

	for (let i = 1; i < count; i++) {
		const label = (await genres.nth(i).textContent())?.trim() ?? "";
		await genres.nth(i).click();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("g"), {
				timeout: 10_000,
			})
			.toBe(label);
	}

	// "All" clears the filter.
	await genres.first().click();
	await expect
		.poll(() => new URL(page.url()).searchParams.get("g"), { timeout: 10_000 })
		.toBeNull();

	expect(errors, "runtime errors").toEqual([]);
});
