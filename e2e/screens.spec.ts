import { test } from "@playwright/test";
import { signIn } from "./auth.ts";

const shots: Array<[string, string]> = [
	["home", "/"],
	["discover", "/discover"],
	["detail-movie", "/detail/movie/tt1375666"],
	["detail-series", "/detail/series/tt0903747"],
	["library", "/library"],
	["collections", "/collections"],
	["collection", "/collections/col-1"],
	["history", "/history"],
	["settings", "/settings"],
	["addons", "/addons"],
	["account", "/account"],
	["support", "/support"],
	["player", "/player/movie/tt0137523"],
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const [name, path] of shots) {
	test(`shot ${name}`, async ({ page, context }) => {
		await signIn(context);
		await page.goto(path);
		// A playing stream never reaches network idle — don't block the shot on it.
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});
		await page.waitForTimeout(1200);
		await page.screenshot({ path: `screens/${name}.png`, fullPage: true });
	});
}

test("shot streams-panel", async ({ page, context }) => {
	await signIn(context);
	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle").catch(() => {});
	await page.getByRole("button", { name: "Watch", exact: true }).click();
	await page.getByRole("complementary").waitFor();
	await page.waitForTimeout(1200);
	await page.screenshot({ path: "screens/streams-panel.png", fullPage: true });
});
