import { DatabaseSync } from "node:sqlite";
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
 * SQLite file (the same one `playwright.config.ts` points `NUVIO_DATA_DIR` at)
 * because there is no API for backdating a sign-in, and a 30-day shape is the
 * thing worth asserting.
 */
const DAY = 86_400_000;
const DB_PATH = "test-results/admin-data/nuvio.sqlite";

function seedSignInEvents(): { total: number; quietDays: number[] } {
	const db = new DatabaseSync(DB_PATH);
	const insert = db.prepare(
		"INSERT INTO sign_in_events (email, at) VALUES (?, ?)",
	);
	const people = ["ana@e.com", "bo@e.com", "cy@e.com", "dee@e.com"];
	const quietDays = [7, 18];
	const now = Date.now();
	let total = 0;
	for (let ago = 29; ago >= 0; ago--) {
		const count = quietDays.includes(ago) ? 0 : (ago > 20 ? 0 : 1) + (ago % 3);
		for (let i = 0; i < count; i++) {
			insert.run(
				people[(ago + i) % people.length],
				now - ago * DAY + i * 3_600_000,
			);
			total++;
		}
	}
	db.close();
	return { total, quietDays };
}

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
