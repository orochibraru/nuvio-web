import type { Page } from "@playwright/test";

/** Broken poster/backdrop images and other third-party asset 404s are not app bugs. */
const IGNORE = [/Failed to load resource/i, /favicon/i, /net::ERR_/i];

/**
 * Collects real runtime problems from a page: uncaught exceptions and genuine
 * `console.error` calls (not resource-load failures).
 */
export function collectRuntimeErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (error) => {
		errors.push(`[pageerror] ${error.message}`);
	});
	page.on("console", (message) => {
		if (message.type() !== "error") {
			return;
		}
		const text = message.text();
		if (IGNORE.some((pattern) => pattern.test(text))) {
			return;
		}
		errors.push(`[console.error] ${text}`);
	});
	return errors;
}
