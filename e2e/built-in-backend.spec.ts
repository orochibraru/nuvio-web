import { execFileSync } from "node:child_process";
import process from "node:process";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * The built-in backend end to end: the admin (the shared test account, see
 * playwright.config.ts) makes it the default, then a brand-new user signs up
 * through the app's own sign-up page, makes a profile and adds a title. The
 * default lives in the server's SQLite, so it is reset inside the e2e
 * container afterwards, the way `custom-backend.spec.ts` flips its policy.
 */
const RUN_STATEMENTS = `
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/nuvio.sqlite");
for (const [sql, params] of JSON.parse(require("node:fs").readFileSync(0, "utf8"))) {
	try {
		db.prepare(sql).run(...params);
	} catch (error) {
		if (!String(error).includes("no such table")) {
			throw error;
		}
	}
}`;

function runSql(statements: [string, (string | number)[]][]): void {
	execFileSync(
		"docker",
		[
			"exec",
			"-i",
			"-e",
			"BUN_BE_BUN=1",
			"nuvio-e2e",
			"/app/dist/server",
			"-e",
			RUN_STATEMENTS,
		],
		{ input: JSON.stringify(statements) },
	);
}

const ADMIN_EMAIL = process.env.NUVIO_TEST_EMAIL ?? "";
const ADMIN_PASSWORD = "built-in admin password";
const ADDON_BASE =
	"https://raw.githubusercontent.com/zedensix/nuvio-web/main/e2e/showcase-addon";

test.afterAll(() => {
	runSql([
		[
			"DELETE FROM settings WHERE key IN ('backends.default_url', 'backends.default_key')",
			[],
		],
		["DELETE FROM backend_users WHERE email = ?", [ADMIN_EMAIL.toLowerCase()]],
	]);
});

test("built-in backend: the admin switches to it and a new user signs up and saves a title", async ({
	page,
	context,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	const errors = collectRuntimeErrors(page);
	await signIn(context);
	await page.goto("/admin?tab=backends");

	const card = page.locator("[data-slot=card]", {
		hasText: "Built-in backend",
	});
	await expect(card).toBeVisible();
	const url = `${baseURL}/api/nuvio`;
	await expect(card.getByText(url, { exact: true })).toBeVisible();
	const key =
		(await card.getByText(/^sb_publishable_/).textContent())?.trim() ?? "";
	expect(key).toMatch(/^sb_publishable_/);

	// Admin emails can't sign up through the API: the admin makes theirs here.
	const switchButton = card.getByRole("button", {
		name: "Use as the default backend",
	});
	if (
		await card.getByRole("button", { name: "Create my account" }).isVisible()
	) {
		await expect(switchButton).toBeDisabled();
		await card.locator("#builtin-password").fill(ADMIN_PASSWORD);
		await card.getByRole("button", { name: "Create my account" }).click();
		await expect(card.getByText("You have an account on it.")).toBeVisible();
	}
	await switchButton.click();
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	// The switch ends the admin's session on the old default.
	await page.goto("/admin");
	await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 15_000 });

	await context.clearCookies();
	const email = `built-in-${Date.now()}@example.com`;
	const password = "a fresh password";
	await page.goto("/auth/sign-up");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Create account" }).click();

	await expect(
		page.getByRole("heading", { name: "Who's watching?" }),
	).toBeVisible({
		timeout: 15_000,
	});
	await page.getByRole("button", { name: "Add profile" }).click();
	await page.getByRole("dialog").getByLabel("Name").fill("Built-in");
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Create" })
		.click();
	await expect(page).not.toHaveURL(/\/profiles/, { timeout: 15_000 });

	// A new account has no addons: install the showcase one the way a user does.
	await page.goto("/settings/addons");
	await page.getByRole("button", { name: "Add addon" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Addon URL").fill(`${ADDON_BASE}/manifest.json`);
	await dialog.getByRole("button", { name: "Add addon" }).click();
	await expect(dialog).toBeHidden({ timeout: 20_000 });

	const headers = { apikey: key, "content-type": "application/json" };
	const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
		headers,
		data: { email, password },
	});
	expect(token.ok()).toBe(true);
	const auth = {
		...headers,
		authorization: `Bearer ${(await token.json()).access_token}`,
	};

	await page.goto("/detail/movie/blender-sintel");
	const toggle = page.getByRole("button", { name: /library/i });
	await expect(toggle).toHaveText(/Add to library/i, { timeout: 20_000 });
	await toggle.click();
	await expect(toggle).toHaveText(/Remove from library/i, { timeout: 10_000 });

	// Mirrored to the built-in backend by the background sync.
	await expect
		.poll(
			async () => {
				const library = await request.post(
					`${url}/rest/v1/rpc/sync_pull_library`,
					{
						headers: auth,
						data: { p_profile_id: 1 },
					},
				);
				return ((await library.json()) as { content_id: string }[]).map(
					(item) => item.content_id,
				);
			},
			{ timeout: 90_000, intervals: [5000] },
		)
		.toContain("blender-sintel");

	// The account deletes itself from its overview, behind its password.
	await page.goto("/account/overview");
	await page.getByRole("button", { name: "Delete my account" }).click();
	const confirm = page.getByRole("dialog");
	await confirm.getByLabel("Password").fill("not the password");
	await confirm.getByRole("button", { name: "Delete my account" }).click();
	await expect(confirm.getByText("That's not your password.")).toBeVisible();
	await confirm.getByLabel("Password").fill(password);
	await confirm.getByRole("button", { name: "Delete my account" }).click();
	await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 15_000 });
	const gone = await request.post(`${url}/auth/v1/token?grant_type=password`, {
		headers,
		data: { email, password },
	});
	expect(gone.status()).toBe(400);

	// Sign-in offers the built-in backend's own reset, whether or not SMTP is set up.
	await page.getByRole("link", { name: "Forgot password?" }).click();
	await expect(page).toHaveURL(/\/auth\/forgot-password/);
	await expect(page.getByText("Reset your password").first()).toBeVisible();
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Send the link" }).click();
	await expect(
		page.getByText(
			/a link to reset its password is on its way|can't send emails yet/,
		),
	).toBeVisible({ timeout: 10_000 });

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});
