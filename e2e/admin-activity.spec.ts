import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * The activity chart, with data in it.
 *
 * `admin.spec.ts` and `a11y.spec.ts` only ever see the empty state: the e2e
 * database starts fresh every run and one signed-in test account produces a
 * single bar on one day. The events are written straight into the server's
 * SQLite file because there is no API for backdating a sign-in, and a 30-day
 * shape is the thing worth asserting.
 */
const DAY = 86_400_000;

/**
 * Runs inside the e2e container (`compose.e2e.yaml`): the WAL database can't
 * be shared with the host across Docker's VM, and the compiled server binary
 * still answers as `bun` under `BUN_BE_BUN`.
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

/** The addresses this spec inserts, so it can take exactly them back out. */
const SEEDED = ["ana@e.com", "bo@e.com", "cy@e.com", "dee@e.com"];

function clearSeededEvents(): void {
	runSql([
		[
			`DELETE FROM sign_in_events WHERE email IN (${SEEDED.map(() => "?").join(", ")})`,
			SEEDED,
		],
	]);
}

function seedSignInEvents(): { total: number; quietDays: number[] } {
	const inserts: [string, (string | number)[]][] = [];
	const people = SEEDED;
	const quietDays = [7, 18];
	const now = Date.now();
	let total = 0;
	for (let ago = 29; ago >= 0; ago--) {
		const count = quietDays.includes(ago) ? 0 : (ago > 20 ? 0 : 1) + (ago % 3);
		for (let i = 0; i < count; i++) {
			inserts.push([
				"INSERT INTO sign_in_events (email, at) VALUES (?, ?)",
				[people[(ago + i) % people.length], now - ago * DAY + i * 3_600_000],
			]);
			total++;
		}
	}
	runSql(inserts);
	return { total, quietDays };
}

// Every spec in the run shares one database, so the rows go back out even when
// an assertion above fails : a later spec seeing this one's leftovers is a
// confusing failure a long way from its cause.
test.afterEach(() => {
	clearSeededEvents();
});

test("admin: the activity chart counts the event log and stays accessible", async ({
	page,
	context,
}) => {
	const errors = collectRuntimeErrors(page);
	await signIn(context);

	// One load first, so the server has created and migrated its database.
	await page.goto("/admin");
	const { total } = seedSignInEvents();
	await page.reload();

	// The headline total, and one bar per day in the window.
	const figure = page
		.getByRole("figure")
		.filter({ hasText: "Sign-ins per day" });
	await expect(figure).toContainText(String(total));
	await expect(figure.getByRole("img")).toHaveAttribute(
		"aria-label",
		new RegExp(`${total} in the last 30 days`),
	);

	// Identity without the chart: the numbers are in a table too.
	await page.getByText("Show the numbers").click();
	await expect(
		page.getByRole("columnheader", { name: "Sign-ins" }),
	).toBeVisible();
	await expect(
		page.getByRole("columnheader", { name: "People" }),
	).toBeVisible();

	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	expect(
		violations.map((violation) => ({
			id: violation.id,
			nodes: violation.nodes.map((node) => node.target.join(" ")),
		})),
	).toEqual([]);

	expect(errors).toEqual([]);
});
