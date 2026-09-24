import { writeFileSync } from "node:fs";
import process from "node:process";
import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { waitForImages } from "./util.ts";

/**
 * Screenshot sequence for the docs' showcase page : not a correctness suite.
 * Run it on its own with `bun run screenshots`; shots land in `docs/showcase/`.
 *
 * Every title on screen must be free to show: the showcase profile has only
 * the `e2e/showcase-addon` fixture installed (Blender open movies, CC BY,
 * streamed from Wikimedia Commons). See `docs/showcase.md` for its setup.
 */

const PROFILE = Number(process.env.NUVIO_SHOWCASE_PROFILE);

interface Shot {
	name: string;
	path: string;
	/** Defaults to true. Set false for an above-the-fold crop instead of the whole scrollable page. */
	fullPage?: boolean;
	/** Defaults to true. Set false for pages that must be visited signed out. */
	signedIn?: boolean;
	/** Extra steps to reach the state being captured (opening a drawer, etc). */
	prepare?: (page: Page) => Promise<void>;
	/** Extra settle time (ms) before the shot, on top of the shared beat. */
	settleMs?: number;
}

/** Re-encodes a PNG screenshot as WebP in the browser itself : no image dependency. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
	const base64 = await page.evaluate(async (source) => {
		const bytes = Uint8Array.from(atob(source), (char) => char.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes]));
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
		const blob = await canvas.convertToBlob({
			type: "image/webp",
			quality: 0.8,
		});
		const out = new Uint8Array(await blob.arrayBuffer());
		let binary = "";
		for (let index = 0; index < out.length; index += 0x80_00) {
			binary += String.fromCharCode(...out.subarray(index, index + 0x80_00));
		}
		return btoa(binary);
	}, png.toString("base64"));
	return Buffer.from(base64, "base64");
}

async function openSourcesPanel(page: Page): Promise<void> {
	await page
		.getByRole("button", { name: "Select stream", exact: true })
		.click();
	await page.getByRole("dialog", { name: "Sources" }).waitFor();
}

async function openFirstCollection(page: Page): Promise<void> {
	await page.locator('main a[href^="/collections/"]').first().click();
	await page.waitForURL(/\/collections\/.+/);
}

async function hideEmail(page: Page): Promise<void> {
	await page
		.getByText(process.env.NUVIO_TEST_EMAIL ?? "", { exact: true })
		.evaluate((element) => {
			element.textContent = "you@example.com";
		});
}

const shots: Shot[] = [
	{ name: "01-sign-in", path: "/auth/sign-in", signedIn: false },
	{ name: "02-sign-up", path: "/auth/sign-up", signedIn: false },
	{ name: "03-home", path: "/", fullPage: false },
	{ name: "04-discover", path: "/discover" },
	{ name: "05-search", path: "/search?q=blender", settleMs: 600 },
	{ name: "06-detail", path: "/detail/movie/blender-sintel" },
	{
		name: "07-sources-panel",
		path: "/detail/movie/blender-tears-of-steel",
		fullPage: false,
		prepare: openSourcesPanel,
	},
	{ name: "08-library", path: "/library" },
	{ name: "09-collections", path: "/collections" },
	{
		name: "10-collection",
		path: "/collections",
		prepare: openFirstCollection,
	},
	{ name: "11-history", path: "/account?tab=history" },
	{ name: "12-stats", path: "/account?tab=stats" },
	{ name: "13-settings", path: "/settings" },
	{ name: "14-addons", path: "/settings?tab=addons" },
	{ name: "15-account", path: "/account", prepare: hideEmail },
	{
		name: "16-player",
		path: "/player/movie/blender-spring",
		fullPage: false,
		settleMs: 3000,
	},
	{
		name: "17-player-info",
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

test.skip(
	!(PROFILE >= 1 && PROFILE <= 6),
	"Set NUVIO_SHOWCASE_PROFILE to the profile set up in docs/showcase.md",
);

for (const shot of shots) {
	test(`shot ${shot.name}`, async ({ page, context }) => {
		if (shot.signedIn !== false) {
			await signIn(context, PROFILE);
		}
		const errors = collectRuntimeErrors(page);

		await page.goto(shot.path);
		// A playing <video> never reaches network idle : don't block the shot on it.
		await page
			.waitForLoadState("networkidle", { timeout: 8000 })
			.catch(() => {});

		if (shot.prepare) {
			await shot.prepare(page);
		}
		await waitForImages(page).catch(() => {});
		await page.waitForTimeout(1000 + (shot.settleMs ?? 0));

		const png = await page.screenshot({ fullPage: shot.fullPage ?? true });
		writeFileSync(`docs/showcase/${shot.name}.webp`, await toWebp(page, png));

		expect(errors, `runtime errors on ${shot.path}`).toEqual([]);
	});
}
