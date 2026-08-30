import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

// Read-only: opens the manage editor and closes it without saving so the test
// account's profiles are never mutated.
test("profiles: manage mode opens the editor", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/profiles");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await expect(
		page.getByRole("heading", { name: "Who's watching?" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Manage profiles" }).click();
	await expect(
		page.getByRole("heading", { name: "Manage profiles" }),
	).toBeVisible();

	// Open the editor for the first profile tile.
	await page
		.getByRole("button", { name: /^Edit / })
		.first()
		.click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Edit profile" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByRole("dialog")).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});
