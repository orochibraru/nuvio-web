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
	["watch-nostreams", "/watch/movie/tt0137523"],
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const [name, path] of shots) {
	test(`shot ${name}`, async ({ page, context }) => {
		await signIn(context);
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(1200);
		await page.screenshot({ path: `screens/${name}.png`, fullPage: true });
	});
}
