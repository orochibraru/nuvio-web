import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const TITLE = "/detail/movie/tt0137523";

function libraryButton(page: Page) {
	return page.getByRole("button", { name: /(Add to|Remove from) library/ });
}

// Two separate browser contexts (own cookies, IndexedDB, BroadcastChannel), so
// the only way B learns about A's change inside the window is the server's
// event stream: B's fallback poll is 90 s, and nothing refocuses it.
test("live sync: a library change in one browser shows up in another", async ({
	context,
	browser,
}, testInfo) => {
	test.setTimeout(90_000);
	const other = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
	});
	await signIn(context);
	await signIn(other);
	const a = await context.newPage();
	const b = await other.newPage();
	const errorsA = collectRuntimeErrors(a);
	const errorsB = collectRuntimeErrors(b);

	await a.goto(TITLE);
	await b.goto(TITLE);
	await expect(libraryButton(a)).toBeVisible({ timeout: 20_000 });
	await expect(libraryButton(b)).toBeVisible({ timeout: 20_000 });
	// Let B's store bootstrap and open its stream.
	await b.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const before = (await libraryButton(a).textContent())?.trim() ?? "";
	const flipped = before.startsWith("Add")
		? /Remove from library/
		: /Add to library/;
	const restored = before.startsWith("Add")
		? /Add to library/
		: /Remove from library/;

	await libraryButton(a).click();
	await expect(libraryButton(b)).toHaveText(flipped, { timeout: 20_000 });

	// Put the shared test account back the way it was.
	await libraryButton(a).click();
	await expect(libraryButton(b)).toHaveText(restored, { timeout: 20_000 });

	await a.waitForTimeout(1000);
	expect([...errorsA, ...errorsB], "runtime errors").toEqual([]);
	await other.close();
});
