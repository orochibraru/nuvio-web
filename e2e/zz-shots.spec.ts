import { devices, test } from "@playwright/test";
import { signIn } from "./auth.ts";

test("sheet shot", async ({ browser }) => {
	const context = await browser.newContext({ ...devices["Pixel 7"] });
	await signIn(context);
	const page = await context.newPage();
	await page.goto("/detail/series/tt0903747");
	await page
		.waitForLoadState("networkidle", { timeout: 15_000 })
		.catch(() => {});
	await page.getByRole("button", { name: "Select stream" }).tap();
	await page.waitForTimeout(2500);
	await page.screenshot({
		path: "/private/tmp/claude-501/-Users-nicolasboyer-Dev-nuvio-web/9358d8bf-194e-4a52-861c-60b477f2aa8c/scratchpad/shots/sheet-header.png",
	});
	await context.close();
});
