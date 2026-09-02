import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

// Committed VP8/WebM sample (~7.8s) — Playwright's Chromium has no H.264, and a
// local file keeps the test off the network.
const SAMPLE = "/e2e/sample.webm";

function harness(params: Record<string, string> = {}): string {
	return `/dev/player?${new URLSearchParams({ src: SAMPLE, ...params }).toString()}`;
}

function currentTime(page: Page): Promise<number> {
	return page.evaluate(() => document.querySelector("video")?.currentTime ?? 0);
}

test("detail source sidebar: opens, resolves async, refreshes, closes", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// tt1375666 (Inception). "Select stream" opens the source drawer; the primary
	// "Watch" / "Resume" CTA now jumps straight to the player instead.
	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const url = page.url();
	await page.getByRole("button", { name: "Select stream" }).first().click();

	const panel = page.getByRole("dialog", { name: "Sources" });
	await expect(panel.getByText("Sources").first()).toBeVisible();
	await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
	// The drawer is module state, not a URL param — opening it must not navigate.
	expect(page.url()).toBe(url);

	// Test account has only Cinemeta (no stream addon) → resolves to empty.
	// The addon fan-out can be slow under a cold cache, so give it room.
	await expect(panel.getByText("No addon streams")).toBeVisible({
		timeout: 30_000,
	});
	await panel.getByRole("button", { name: "Refresh" }).click();
	await expect(panel.getByText("No addon streams")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(panel).toBeHidden();
	expect(page.url()).toBe(url);

	expect(errors).toEqual([]);
});

test("detail page warms the stream fan-out before the drawer opens", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	let resolvedStreamsRequested = false;
	page.on("request", (request) => {
		if (request.url().includes("resolveStreams")) {
			resolvedStreamsRequested = true;
		}
	});

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	// The preload kicks off ~700ms after meta loads — never touching the drawer.
	await expect
		.poll(() => resolvedStreamsRequested, { timeout: 6000 })
		.toBe(true);

	expect(errors).toEqual([]);
});

test("detail: mark a movie watched, then unwatch", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/detail/movie/tt1375666");
	await page.waitForLoadState("networkidle");

	const mark = page.getByRole("button", { name: /Mark watched|Watched/ });
	if ((await mark.textContent())?.includes("Watched")) {
		await mark.click();
		await expect(mark).toHaveText(/Mark watched/, { timeout: 10_000 });
	}
	await mark.click();
	await expect(mark).toHaveText(/Watched/, { timeout: 10_000 });
	await mark.click();
	await expect(mark).toHaveText(/Mark watched/, { timeout: 10_000 });

	expect(errors).toEqual([]);
});

test("player page with no resolvable stream renders cleanly", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);
	// tt0000001 — an 1894 short; addons have at most a non-web-playable source.
	await page.goto("/player/movie/tt0000001");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	// Either "No playable stream" or "This source can't play in the browser".
	await expect(
		page.getByRole("button", { name: "Choose a source" }),
	).toBeVisible({ timeout: 20_000 });
	// A back button must always be reachable while no stream is loaded.
	await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
	await page.waitForTimeout(1000);
	expect(errors).toEqual([]);
});

test("video player: autoplay, keyboard seek, speed menu", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness());
	await page.waitForLoadState("networkidle");

	const player = page.getByRole("region", { name: "Video player" });
	await expect(player).toBeVisible();

	// The player autoplays; the loading treatment clears once it's running.
	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(0.4);
	await page.evaluate(() => document.querySelector("video")?.pause());

	// keyboard nudge — the clip is short, so just confirm the direction of change
	await page.evaluate(() => {
		const video = document.querySelector("video");
		if (video) {
			video.currentTime = 0.5;
		}
	});
	await page.keyboard.press("ArrowRight");
	await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
	await page.keyboard.press("ArrowLeft");
	await expect.poll(() => currentTime(page)).toBeLessThan(1);

	await player.getByRole("button", { name: "Settings" }).click();
	// The settings menu portals to the document body, outside the player region.
	await page.getByRole("menuitemradio", { name: "1.5×" }).click();
	const rate = await page.evaluate(
		() => document.querySelector("video")?.playbackRate ?? 0,
	);
	expect(rate).toBe(1.5);

	expect(errors, "runtime errors").toEqual([]);
});

test("detail page shows official watch providers (JustWatch)", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// Reacher — a Prime Video original, stable availability.
	await page.goto("/detail/series/tt9288030");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const available = page.getByText("Available on", { exact: false });
	// JustWatch can rate-limit / miss — don't hard-fail the suite on a flaky
	// upstream, but when it does resolve it must render a Prime link + badge.
	if (await available.isVisible({ timeout: 20_000 }).catch(() => false)) {
		const prime = page.getByRole("link", { name: /Prime Video/i }).first();
		await expect(prime).toBeVisible();
		await expect(prime).toHaveAttribute("target", "_blank");
		await expect(
			page.getByRole("link", { name: /More options on JustWatch/i }),
		).toBeVisible();
	}

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});

test("player info overlay: Info button + auto-on-pause", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness({ info: "1" }));
	await page.waitForLoadState("networkidle");

	const player = page.getByRole("region", { name: "Video player" });
	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(1);

	const synopsis = page.getByText("A dev-harness synopsis", { exact: false });
	const infoButton = player.getByRole("button", { name: "Info" });

	// The Info button toggles it; it stays up while playing.
	await infoButton.click();
	await expect(synopsis).toBeVisible();
	await page.waitForTimeout(400);
	await expect(synopsis).toBeVisible();
	// Transport controls stay live behind the overlay, not trapped behind it.
	await expect(player.getByRole("button", { name: "Mute" })).toBeVisible();

	// The Info button toggles it closed again.
	await infoButton.click();
	await expect(synopsis).toBeHidden();

	// So does the overlay's own close button.
	await infoButton.click();
	await expect(synopsis).toBeVisible();
	await player.getByRole("button", { name: "Close", exact: true }).click();
	await expect(synopsis).toBeHidden();

	// A deliberate pause surfaces it automatically...
	await page.evaluate(() => document.querySelector("video")?.pause());
	await expect(synopsis).toBeVisible({ timeout: 4000 });

	// ...dismissing it during the pause keeps it dismissed (no auto-reopen)...
	await page.keyboard.press("Escape");
	await expect(synopsis).toBeHidden();
	await page.waitForTimeout(1200);
	await expect(synopsis).toBeHidden();

	// ...and resuming then re-pausing surfaces it again.
	await page.evaluate(() => document.querySelector("video")?.play());
	await page.waitForTimeout(300);
	await page.evaluate(() => document.querySelector("video")?.pause());
	await expect(synopsis).toBeVisible({ timeout: 4000 });
	await page.evaluate(() => document.querySelector("video")?.play());
	await expect(synopsis).toBeHidden({ timeout: 4000 });

	expect(errors, "runtime errors").toEqual([]);
});

test("player fatal screen offers an external-player handoff", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// A non-media src trips MEDIA_ERR_SRC_NOT_SUPPORTED → the fatal screen.
	const fatal = `/dev/player?${new URLSearchParams({
		src: "/e2e/errors.ts",
		external: "https://cdn.example/movie.mkv",
	}).toString()}`;

	await page.goto(fatal);
	await page.waitForLoadState("networkidle").catch(() => {});

	const player = page.getByRole("region", { name: "Video player" });
	// Desktop registers no player URL scheme, so the button copies the link
	// rather than deep-linking — but it is always offered, because the screen
	// says an external player is an option.
	const play = player.getByRole("button", { name: "Play in external player" });
	await expect(play).toBeVisible({ timeout: 10_000 });
	await expect(player.getByRole("button", { name: "Copy link" })).toBeVisible();

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});

test("external-player handoff hands Android's OS chooser a real Intent URL", async ({
	browser,
}) => {
	// The scheme can't just be glued in front of the URL: `vlc://https://host`
	// parses as authority `https:` and the colon is dropped, which is what made
	// the old button a no-op.
	const context = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
	});
	const page = await context.newPage();
	const errors = collectRuntimeErrors(page);

	await page.goto(
		`/dev/player?${new URLSearchParams({
			src: "/e2e/errors.ts",
			external: "https://cdn.example/movie.mkv",
		}).toString()}`,
	);
	await page.waitForLoadState("networkidle").catch(() => {});

	const open = page
		.getByRole("region", { name: "Video player" })
		.getByRole("link", { name: "Play in external player" });
	await expect(open).toBeVisible({ timeout: 10_000 });
	await expect(open).toHaveAttribute(
		"href",
		"intent://cdn.example/movie.mkv#Intent;scheme=https;action=android.intent.action.VIEW;type=video/*;end",
	);

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
	await context.close();
});

test("video-decode watchdog surfaces a dismissible banner, never a wall", async ({
	page,
}) => {
	test.slow(); // the watchdog's fuse is deliberately long (10s of playback)
	const errors = collectRuntimeErrors(page);

	// The harness fakes "picture never decodes" (frozen counter + videoWidth 0)
	// and loops the short clip so the long, conservative fuse can elapse.
	await page.goto(harness({ breakvideo: "1" }));
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => {
		const v = document.querySelector("video");
		if (v) {
			v.loop = true;
		}
	});

	const player = page.getByRole("region", { name: "Video player" });
	// It's a banner over the still-usable player, not a takeover.
	await expect(player.getByText(/video may not be playing/i)).toBeVisible({
		timeout: 30_000,
	});
	await expect(player.getByRole("button", { name: "Mute" })).toBeVisible();

	// "Looks fine" dismisses it for good.
	await player.getByRole("button", { name: "Looks fine" }).click();
	await expect(player.getByText(/video may not be playing/i)).toBeHidden();
	await page.waitForTimeout(1500);
	await expect(player.getByText(/video may not be playing/i)).toBeHidden();

	expect(errors, "runtime errors").toEqual([]);
});

test("player converts an SRT subtitle to WebVTT in the browser", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// No /api/subtitle hop any more — the track is fetched + converted client-side.
	let proxied = false;
	page.on("request", (r) => {
		if (r.url().includes("/api/subtitle")) {
			proxied = true;
		}
	});

	await page.goto(harness({ subs: "/e2e/sample.srt" }));
	await page.waitForLoadState("networkidle");
	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(0.4);

	const player = page.getByRole("region", { name: "Video player" });
	await player.getByRole("button", { name: "Subtitles" }).click();
	await player.getByRole("button", { name: /English/ }).click();

	// The <track> mounted from a blob: URL and the browser parsed the cues.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const t = document.querySelector("video")?.textTracks?.[0];
					return t && t.mode === "showing" ? (t.cues?.length ?? 0) : 0;
				}),
			{ timeout: 5000 },
		)
		.toBeGreaterThan(0);
	expect(
		await page.evaluate(
			() => document.querySelector("video track")?.getAttribute("src") ?? "",
		),
	).toMatch(/^blob:/);
	expect(proxied, "no server subtitle proxy").toBe(false);

	await page.waitForTimeout(300);
	expect(errors, "runtime errors").toEqual([]);
});

test("player seeks to startTime and leaves cleanly", async ({ page }) => {
	const errors = collectRuntimeErrors(page);

	await page.goto(harness({ start: "5" }));
	await page.waitForLoadState("networkidle");

	await expect
		.poll(() => currentTime(page), { timeout: 15_000 })
		.toBeGreaterThan(4.5);

	await page.goto("/dev/player");
	await page.waitForLoadState("networkidle");
	expect(errors, "runtime errors leaving the player").toEqual([]);
});

test("player Back goes to the title's detail page, not wherever history points", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// Opened directly, so there is no history to go back to — the old
	// `history.back()` had nothing to do here. An episode also proves the
	// destination uses the *content* id, not the video id (`tt0903747:1:1`).
	await page.goto("/player/series/tt0903747:1:1");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	await page.getByRole("button", { name: "Back" }).first().click();
	await expect(page).toHaveURL(/\/detail\/series\/tt0903747$/);
	await expect(
		page.getByRole("heading", { name: /Breaking Bad/i }).first(),
	).toBeVisible({ timeout: 20_000 });

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});

test("player episode drawer: season switcher + jump to another episode", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	await page.goto("/player/series/tt0903747:1:1");
	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

	const episodesButton = page.getByRole("button", { name: "Episodes" });
	// Needs a browser-playable stream from the test account's addons — skip if none.
	if (!(await episodesButton.isVisible().catch(() => false))) {
		test.skip(true, "no web-playable stream resolved for the drawer test");
	}

	await episodesButton.click();
	const drawer = page.getByRole("complementary", { name: "Episodes" });
	await expect(drawer).toBeVisible();
	await expect(drawer.getByText("Now")).toBeVisible();

	// Switch season, then open an episode from it.
	await drawer.getByRole("button", { name: "Season 2" }).click();
	await drawer.getByRole("button", { name: /^1\./ }).click();
	await expect(page).toHaveURL(/tt0903747(%3A|:)2(%3A|:)1/);
	await expect(drawer).toBeHidden();

	await page.waitForTimeout(1000);
	expect(errors, "runtime errors").toEqual([]);
});

// Regression: navigating right after an optimistic write must not drop it. The
// sync store's debounced flush (~1.5s) and its pending-write queue used to be
// torn down by the `(app)` layout effect's cleanup on every navigation, so a
// write made just before a route change never reached the server. Uses a
// library toggle because it needs no video playback (browser-agnostic).
test("sync: an optimistic write survives an immediate navigation", async ({
	page,
	context,
}) => {
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	let flushed = false;
	page.on("request", (request) => {
		if (request.url().includes("flushWrites")) {
			flushed = true;
		}
	});

	// Interstellar — not in the test account's baseline library.
	await page.goto("/detail/movie/tt0816692");
	await page.waitForLoadState("networkidle");

	const toggle = page.getByRole("button", { name: /library/i });
	if ((await toggle.textContent())?.includes("Remove from library")) {
		await toggle.click();
		await expect(toggle).toHaveText(/Add to library/i, { timeout: 10_000 });
	}

	// Toggle, then navigate away well within the flush debounce window.
	await toggle.click();
	await expect(toggle).toHaveText(/Remove from library/i, { timeout: 10_000 });
	await page
		.getByRole("navigation")
		.getByRole("link", { name: "Library" })
		.click();
	await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

	// The queued write must still flush after the navigation.
	await expect(() => expect(flushed).toBe(true)).toPass({ timeout: 15_000 });

	// Restore: remove what this test added.
	await page.goto("/detail/movie/tt0816692");
	await page.waitForLoadState("networkidle");
	const t2 = page.getByRole("button", { name: /library/i });
	if ((await t2.textContent())?.includes("Remove from library")) {
		await t2.click();
		await expect(t2).toHaveText(/Add to library/i, { timeout: 10_000 });
	}

	expect(errors, "runtime errors").toEqual([]);
});

test("player: the cast button shows only when a device is available", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	// Headless Chromium exposes the Remote Playback API but never finds a
	// device, so the button stays hidden rather than dangling uselessly.
	await page.goto(harness());
	await expect(
		page.getByRole("region", { name: "Video player" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Cast" })).toHaveCount(0);

	// Fake a device turning up on the network.
	await page.addInitScript(() => {
		Object.defineProperty(HTMLMediaElement.prototype, "remote", {
			configurable: true,
			get() {
				return {
					state: "disconnected",
					prompt: () => Promise.resolve(),
					watchAvailability: (cb: (available: boolean) => void) => {
						setTimeout(() => cb(true), 0);
						return Promise.resolve(1);
					},
					cancelWatchAvailability: () => Promise.resolve(),
					addEventListener: () => {},
					removeEventListener: () => {},
				};
			},
		});
	});
	await page.goto(harness());
	await expect(page.getByRole("button", { name: "Cast" })).toBeVisible({
		timeout: 10_000,
	});

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});
