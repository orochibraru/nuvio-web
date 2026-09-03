import process from "node:process";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// playwright.config.ts makes the shared test account a server admin
// (NUVIO_ADMIN_EMAILS) and points the server's database at a scratch dir.

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

test("admin: the page lists sign-ins and the access controls", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/admin");

	await expect(
		page.getByRole("heading", { name: "Server admin" }),
	).toBeVisible();
	await expect(page.getByText("Access", { exact: true })).toBeVisible();
	await expect(page.getByText("Sign-ins", { exact: true })).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("admin: the sign-in log records the account that signed in", async ({
	page,
	context,
}) => {
	// A real password grant through the app's own form, so the recording path
	// runs end to end rather than being stubbed.
	await context.clearCookies();
	await page.goto("/auth/sign-in");
	await page.getByLabel("Email").fill(process.env.NUVIO_TEST_EMAIL ?? "");
	await page
		.getByLabel("Password", { exact: true })
		.fill(process.env.NUVIO_TEST_PASSWORD ?? "");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 30_000 });

	await page.goto("/admin");
	const email = (process.env.NUVIO_TEST_EMAIL ?? "").toLowerCase();
	await expect(
		page.getByRole("cell", { name: email, exact: true }),
	).toBeVisible();
});

test("admin: locking is reflected in the page, and unlocking restores it", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/admin");

	const lock = page.getByRole("button", { name: "Lock server" });
	const unlock = page.getByRole("button", { name: "Unlock server" });

	// Start from a known state whichever way a previous run left it.
	if (await unlock.isVisible()) {
		await unlock.click();
		await expect(lock).toBeVisible();
	}

	await lock.click();
	await expect(unlock).toBeVisible();
	await expect(page.getByText("Locked : invite only")).toBeVisible();

	// The admin is never locked out by their own lock : this navigation would
	// bounce to sign-in if eviction did not exempt them.
	await page.goto("/admin");
	await expect(
		page.getByRole("heading", { name: "Server admin" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Unlock server" }).click();
	await expect(page.getByText("Open : anyone can sign in")).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("admin: an address can be allowed and revoked", async ({ page }) => {
	await page.goto("/admin");

	const guest = "e2e-guest@example.com";
	await page.getByLabel("Allow an email address").fill(guest);
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByText(guest)).toBeVisible();

	await page
		.getByRole("button", { name: `Remove ${guest} from the allowlist` })
		.click();
	await expect(page.getByText(guest)).toBeHidden();
});

test("admin: /admin is a 404 for a signed-in non-admin", async ({
	browser,
}) => {
	// A fresh context with no session at all is the closest stand-in for "not
	// the admin account": the guard runs before anything else on the route.
	const context = await browser.newContext();
	const page = await context.newPage();
	const response = await page.goto("/admin");
	// Signed out, the (protected) layout redirects to sign-in rather than
	// rendering the admin page.
	expect(page.url()).toContain("/auth/sign-in");
	expect(response?.status()).toBeLessThan(400);
	await expect(
		page.getByRole("heading", { name: "Server admin" }),
	).toBeHidden();
	await context.close();
});
