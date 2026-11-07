import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * The sign-in form's "Custom backend" section. The policy lives in the
 * server's SQLite, so it is flipped inside the e2e container, the way
 * `admin-activity.spec.ts` seeds its events.
 */
const RUN_STATEMENTS = `
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/nuvio.sqlite");
for (const [sql, params] of JSON.parse(require("node:fs").readFileSync(0, "utf8"))) {
	db.prepare(sql).run(...params);
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

function allowCustomBackends(allowed: boolean): void {
	runSql([
		[
			`INSERT INTO settings (key, value) VALUES ('backends.custom_allowed', ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[allowed ? "1" : "0"],
		],
	]);
}

test.afterEach(() => {
	allowCustomBackends(false);
});

test("sign-in: names the target, and offers no change unless the admin allows it", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/auth/sign-in");
	await expect(page.getByTestId("backend-target")).toContainText("Nuvio");
	await expect(page.getByRole("button", { name: "Change" })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("sign-in: a chosen backend is remembered, named, and a private address refused", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	// One load first, so the server has created and migrated its database.
	await page.goto("/auth/sign-in");
	allowCustomBackends(true);
	await page.reload();

	const target = page.getByTestId("backend-target");
	await page.getByRole("button", { name: "Change" }).click();
	const sheet = page.getByRole("dialog", { name: "Where to sign in" });
	await sheet.getByLabel("Custom backend").check();
	await sheet.getByLabel("Backend URL").fill("http://127.0.0.1:9");
	await sheet.getByLabel("Publishable key").fill("sb_publishable_test");
	await sheet.getByRole("button", { name: "Done" }).click();
	await expect(sheet).toHaveCount(0);
	await expect(target).toContainText("127.0.0.1:9");

	// Remembered in this browser across a reload.
	await page.reload();
	await expect(target).toContainText("127.0.0.1:9");

	await page.getByLabel("Email").fill("nobody@example.com");
	await page.getByLabel("Password", { exact: true }).fill("not-a-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByText("private or local address")).toBeVisible();

	await page.getByRole("button", { name: "Change" }).click();
	await sheet.getByLabel("Default").check();
	await sheet.getByRole("button", { name: "Done" }).click();
	await expect(target).toContainText("Nuvio");
	await page.reload();
	await expect(target).toContainText("Nuvio");

	expect(errors).toEqual([]);
});
