import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

const pages = [
	{ name: "home", path: "/" },
	{ name: "discover", path: "/discover" },
	{ name: "library", path: "/library" },
	{ name: "collections", path: "/collections" },
	{ name: "settings", path: "/settings" },
	{ name: "settings-playback", path: "/settings?tab=playback" },
	{ name: "settings-sync", path: "/settings?tab=sync" },
	{ name: "settings-addons-tab", path: "/settings?tab=addons" },
	{ name: "addons", path: "/addons" },
	{ name: "account", path: "/account" },
	{ name: "account-history", path: "/account?tab=history" },
	{ name: "account-stats", path: "/account?tab=stats" },
	{ name: "account-storage", path: "/account?tab=storage" },
	{ name: "search", path: "/search?q=matrix" },
	{ name: "detail", path: "/detail/movie/tt0137523" },
	{ name: "player", path: "/player/movie/tt0137523" },
];

for (const { name, path } of pages) {
	test(`no WCAG A/AA violations: ${name}`, async ({ page }) => {
		await page.goto(path);
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});

		const { violations } = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();

		const summary = violations.map((v) => ({
			id: v.id,
			impact: v.impact,
			nodes: v.nodes.map((n) => n.target.join(" ")),
		}));
		expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
	});
}

async function expectNoViolations(page: import("@playwright/test").Page) {
	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	const summary = violations.map((v) => ({
		id: v.id,
		impact: v.impact,
		nodes: v.nodes.map((n) => n.target.join(" ")),
	}));
	expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

test("no violations: command palette open", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.keyboard.press("ControlOrMeta+k");
	await expect(page.getByPlaceholder(/Jump to a page/)).toBeVisible();
	await expectNoViolations(page);
});

test("no violations: detail source drawer open", async ({ page }) => {
	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.getByRole("button", { name: "Select stream" }).first().click();
	await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
	await expectNoViolations(page);
});

test("skip link jumps focus to main content", async ({ page }) => {
	await page.goto("/");
	await page.keyboard.press("Tab");
	const skip = page.getByRole("link", { name: "Skip to content" });
	await expect(skip).toBeFocused();
	await skip.press("Enter");
	await expect(page.locator("#main-content")).toBeFocused();
});

test("client navigation moves focus to main content", async ({ page }) => {
	await page.goto("/");
	const link = page
		.getByRole("navigation")
		.getByRole("link", { name: "Discover" });
	await link.waitFor();
	await link.click();
	await page.waitForURL("**/discover");
	await expect(page.locator("#main-content")).toBeFocused();
});
