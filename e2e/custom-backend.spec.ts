import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * The sign-in form's backend picker. The policy lives in the
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

test("sign-in: no backend picker while the official API is the only choice", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/auth/sign-in");
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
	await expect(page.getByTestId("backend-picker")).toHaveCount(0);
	await expect(page.getByLabel("Backend URL")).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("sign-in: a custom backend is picked, remembered, and a private address refused", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	// One load first, so the server has created and migrated its database.
	await page.goto("/auth/sign-in");
	allowCustomBackends(true);
	await page.reload();

	const official = page.getByRole("radio", { name: /^Nuvio/ });
	const custom = page.getByRole("radio", { name: /Custom backend/ });
	await expect(official).toBeChecked();
	await expect(page.getByLabel("Backend URL")).toHaveCount(0);

	await custom.check();
	await page.getByLabel("Backend URL").fill("http://127.0.0.1:9");
	await page.getByLabel("Publishable key").fill("sb_publishable_test");

	// Remembered in this browser across a reload.
	await page.reload();
	await expect(custom).toBeChecked();
	await expect(page.getByLabel("Backend URL")).toHaveValue(
		"http://127.0.0.1:9",
	);

	await page.getByLabel("Email").fill("nobody@example.com");
	await page.getByLabel("Password", { exact: true }).fill("not-a-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByText("private or local address")).toBeVisible();

	await official.check();
	await expect(page.getByLabel("Backend URL")).toHaveCount(0);
	await page.reload();
	await expect(official).toBeChecked();

	expect(errors).toEqual([]);
});
