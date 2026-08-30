import type { Page } from "@playwright/test";

/**
 * Waits for every `<img>` currently on the page to finish loading (or fail)
 * so a screenshot doesn't catch a blank/placeholder frame mid-fetch.
 */
export async function waitForImages(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const images = Array.from(document.images);
		await Promise.all(
			images.map((img) => {
				if (img.complete) {
					return Promise.resolve();
				}
				return new Promise<void>((resolve) => {
					img.addEventListener("load", () => resolve(), { once: true });
					img.addEventListener("error", () => resolve(), { once: true });
				});
			}),
		);
	});
}
