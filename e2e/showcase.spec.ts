import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { waitForImages } from "./util.ts";

/**
 * Dedicated screenshot sequence for showcasing the app (README, release
 * notes, marketing) : not a correctness suite. Run it on its own with
 * `bun run screenshots`; `bun run test:e2e` never pulls this in (see the
 * `showcase` project in playwright.config.ts).
 *
 * Shots are numbered to read as one walkthrough : sign-in through playback —
 * and land in `screens/` (gitignored; pick the ones worth committing /
 * embedding by hand). Each still asserts zero console errors: a cheap sanity
 * net, not a substitute for `test:e2e`.
 */

interface Shot {
	name: string;
	path: string;
	/** Defaults to true. Set false for an above-the-fold "hero" crop instead of the whole scrollable page. */
	fullPage?: boolean;
	/** Defaults to true. Set false for pages that must be visited signed out. */
	signedIn?: boolean;
	/** Extra steps to reach the state being captured (opening a drawer, etc). */
	prepare?: (page: Page) => Promise<void>;
	/** Extra settle time (ms) before the shot, on top of the shared beat. */
	settleMs?: number;
}

async function openSourcesPanel(page: Page): Promise<void> {
	await page
		.getByRole("button", { name: "Select stream", exact: true })
		.click();
	await page.getByRole("dialog", { name: "Sources" }).waitFor();
}

const shots: Shot[] = [
	{ name: "01-sign-in", path: "/auth/sign-in", signedIn: false },
	{ name: "02-sign-up", path: "/auth/sign-up", signedIn: false },
	{ name: "03-home", path: "/", fullPage: false },
	{ name: "04-discover", path: "/discover" },
	{ name: "05-search", path: "/search?q=breaking%20bad", settleMs: 600 },
	{ name: "06-detail-movie", path: "/detail/movie/tt1375666" },
	{
		name: "06b-detail-providers",
		path: "/detail/series/tt9288030",
		settleMs: 1500,
	},
	{
		name: "07-sources-panel",
		path: "/detail/movie/tt1375666",
		fullPage: false,
		prepare: openSourcesPanel,
	},
	{ name: "08-detail-series", path: "/detail/series/tt0903747" },
	{ name: "09-library", path: "/library" },
	{ name: "10-collections", path: "/collections" },
	{ name: "11-collection", path: "/collections/col-1" },
	{ name: "12-history", path: "/account?tab=history" },
	{ name: "13-stats", path: "/account?tab=stats" },
	{ name: "14-settings", path: "/settings" },
	{ name: "15-addons", path: "/addons" },
	{ name: "16-account", path: "/account" },
	{
		name: "17-player",
		path: "/player/movie/tt0137523",
		fullPage: false,
		settleMs: 800,
	},
	{
		name: "18-player-info",
		path: "/dev/player?src=/e2e/sample.webm&info=1",
		fullPage: false,
		settleMs: 900,
		prepare: async (page) => {
			await page.getByRole("button", { name: "Info" }).click();
			await page.getByText("A dev-harness synopsis").waitFor();
		},
	},
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const shot of shots) {
	test(`shot ${shot.name}`, async ({ page, context }) => {
		if (shot.signedIn !== false) {
			await signIn(context);
		}
		const errors = collectRuntimeErrors(page);

		await page.goto(shot.path);
		// A playing <video> (the player shot) never reaches network idle : don't
		// block the shot on it.
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => { });

		if (shot.prepare) {
			await shot.prepare(page);
		}
		await waitForImages(page).catch(() => { });
		await page.waitForTimeout(1000 + (shot.settleMs ?? 0));

		await page.screenshot({
			path: `screens/${shot.name}.png`,
			fullPage: shot.fullPage ?? true,
		});

		expect(errors, `runtime errors on ${shot.path}`).toEqual([]);
	});
}
