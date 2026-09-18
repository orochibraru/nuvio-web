import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";

/**
 * `a11y.spec.ts` runs in whatever mode the test profile has stored (dark), so
 * light mode's contrast went unchecked : and failed: muted text on the faint
 * pill tints, the ⌘K badge, the destructive button. This switches the profile
 * to Light, runs axe over the routes that carry those surfaces, and always
 * switches back : the e2e account is shared.
 */

const routes = [
	"/",
	"/library",
	"/detail/series/tt0903747",
	"/settings",
	"/settings?tab=playback",
	"/account?tab=stats",
	"/account?tab=storage",
];

test.use({ colorScheme: "light" });

test("light mode: no WCAG A/AA violations", async ({ page, context }) => {
	test.setTimeout(180_000);
	await signIn(context);
	const setMode = async (mode: "Light" | "Dark") => {
		await page.goto("/settings");
		const button = page.getByRole("button", { name: mode, exact: true });
		await button.click();
		await expect(button).toHaveClass(/bg-primary/);
		await page.waitForTimeout(1000);
	};

	await setMode("Light");
	const failures: Record<string, unknown> = {};
	try {
		for (const route of routes) {
			await page.goto(route);
			await page
				.waitForLoadState("networkidle", { timeout: 8000 })
				.catch(() => {});
			const { violations } = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			if (violations.length > 0) {
				failures[route] = violations.map((violation) => ({
					id: violation.id,
					nodes: violation.nodes.map((node) => node.target.join(" ")),
				}));
			}
		}
	} finally {
		await setMode("Dark");
	}
	expect(failures, JSON.stringify(failures, null, 2)).toEqual({});
});
