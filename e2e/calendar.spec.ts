import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("calendar: lists episodes by day or says nothing is coming", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/calendar");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await expect(
		page.getByRole("heading", { name: "Calendar", level: 1 }),
	).toBeVisible();
	await expect(page).toHaveTitle("Calendar · Nuvio Web (unofficial)");

	const firstEpisode = page
		.getByRole("main")
		.getByRole("listitem")
		.getByRole("link")
		.first();
	await expect(
		firstEpisode.or(page.getByText("Nothing on the calendar")),
	).toBeVisible({ timeout: 20_000 });

	if (await firstEpisode.isVisible()) {
		await firstEpisode.click();
		await expect(page).toHaveURL(/\/detail\/series\//);
	}
	await page.waitForTimeout(500);

	expect(errors, "runtime errors").toEqual([]);
});

test("calendar: the phone tab bar has a Calendar tab", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	const tabs = page.getByRole("navigation", { name: "Main" });
	await tabs.getByRole("link", { name: "Calendar" }).click();

	await expect(page).toHaveURL(/\/calendar$/);
	await expect(tabs.getByRole("link", { name: "Calendar" })).toHaveAttribute(
		"aria-current",
		"page",
	);

	expect(errors, "runtime errors").toEqual([]);
});
