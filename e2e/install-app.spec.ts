import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const RELEASE =
	"https://github.com/zedensix/nuvio-web/releases/latest/download/";

test.beforeEach(async ({ context }) => {
	await signIn(context);
	// A Windows browser, whatever machine runs the suite.
	await context.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, "userAgentData", {
			get: () => ({
				platform: "Windows",
				getHighEntropyValues: () => Promise.resolve({ architecture: "x86" }),
			}),
		});
	});
});

test("install app: choose the desktop app and get this computer's build", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");
	await page.waitForLoadState("networkidle");
	// The browser's install offer, which headless Chromium never makes.
	await page.evaluate(() => {
		const offer = new Event("beforeinstallprompt", { cancelable: true });
		Object.assign(offer, { prompt: () => Promise.resolve() });
		window.dispatchEvent(offer);
	});

	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Install app" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("button", { name: /Web app/ })).toBeVisible();
	await dialog.getByRole("button", { name: /Desktop app/ }).click();

	await expect(
		dialog.getByRole("link", { name: "Download for Windows" }),
	).toHaveAttribute("href", `${RELEASE}win-x64-NuvioWeb-Setup.zip`);
	await expect(dialog.getByRole("listitem")).toHaveCount(4);
	await dialog.getByRole("button", { name: "Back" }).click();
	await expect(dialog.getByRole("button", { name: /Web app/ })).toBeVisible();

	expect(errors, "runtime errors").toEqual([]);
});

test("install app: without the browser's offer the web app says how", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");
	await page.waitForLoadState("networkidle");

	await page.getByRole("button", { name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: "Install app" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: /Web app/ }).click();
	await expect(dialog).toContainText("address bar or menu");

	expect(errors, "runtime errors").toEqual([]);
});

test("install app: not offered inside the desktop app", async ({
	page,
	context,
}) => {
	await context.addInitScript(() => {
		window.nuvioDesktop = {};
	});
	const errors = collectRuntimeErrors(page);
	await page.goto("/discover");
	await page.waitForLoadState("networkidle");

	await page.getByRole("button", { name: "Profile menu" }).click();
	await expect(page.getByRole("menuitem", { name: "Downloads" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Install app" })).toHaveCount(
		0,
	);

	expect(errors, "runtime errors").toEqual([]);
});
