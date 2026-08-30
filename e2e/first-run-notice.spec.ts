import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context, 1, { seedDisclaimerAck: false });
});

test("first-run notice: shows once, then stays dismissed", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/");
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Before you start")).toBeVisible();

	await page.getByRole("button", { name: "I understand" }).click();
	await expect(dialog).toBeHidden();

	// A reload does not bring it back.
	await page.reload();
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await expect(page.getByText("Before you start")).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});
