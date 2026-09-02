import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";

// The webm harness clip has working Vorbis audio : the silent-media detector
// must not false-flag it, and the rework must not throw.
test("silent-media detector does not false-flag a normal clip", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/dev/player?src=/e2e/sample.webm");
	await page.waitForLoadState("networkidle");

	await page.evaluate(() => {
		const v = document.querySelector("video");
		if (v) {
			v.loop = true;
			void v.play().catch(() => { });
		}
	});

	// Let it play well past the detector's evaluation window.
	await page.waitForTimeout(12_000);

	await expect(page.getByText(/without sound|no audio/i)).toHaveCount(0);
	expect(errors, "runtime errors").toEqual([]);
});
