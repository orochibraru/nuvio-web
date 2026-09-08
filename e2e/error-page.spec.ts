import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("error page: an unknown route renders the error page, not a blank 404", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	const response = await page.goto("/no-such-route-exists");

	expect(response?.status()).toBe(404);
	await expect(page.getByText("Error 404", { exact: true })).toBeVisible();
	// The message must never fall through to an empty heading: before this, the
	// page threw away `page.error.message` in dev and showed nothing useful.
	const heading = page.getByRole("heading", { level: 1 });
	await expect(heading).toBeVisible();
	expect((await heading.textContent())?.trim()).not.toBe("");

	await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
	expect(errors).toEqual([]);
});
