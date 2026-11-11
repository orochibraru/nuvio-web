import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { serveFixtures } from "./fixtures.ts";

test.beforeEach(({ context }) => serveFixtures(context));

const VIDEO_ID = "tt0903747:1:2";
const STREAM = "https://cdn.example/episode.mkv";

declare global {
	interface Window {
		__mpv: { requests: { url: string; start: number }[]; stops: number };
		__engine: { opened: number; commands: Record<string, unknown>[] };
	}
}

function mpvEvent(page: Page, detail: Record<string, unknown>) {
	return page.evaluate((event) => {
		window.dispatchEvent(new CustomEvent("nuvio:mpv", { detail: event }));
	}, detail);
}

// The desktop app's bridge, faked: the page can't tell, and the shell side
// (mpv itself) is the desktop app's to test. The picked source is one the
// browser can't play, so the page hands it to mpv on its own.
test("desktop: a source the web view can't play goes to mpv, and its screen follows mpv", async ({
	page,
	context,
}) => {
	await signIn(context);
	await context.addInitScript((videoId) => {
		window.__mpv = { requests: [], stops: 0 };
		window.nuvioDesktop = {
			mpv: (request) => window.__mpv.requests.push(request),
			stopMpv: () => {
				window.__mpv.stops += 1;
			},
		};
		sessionStorage.setItem(
			"nuvio:selected-stream",
			JSON.stringify({
				videoId,
				url: "https://cdn.example/episode.mkv",
				externalUrl: null,
				notWebReady: true,
				label: "E2E unplayable",
				addonName: "E2E",
				infoHash: null,
				audioRisky: false,
				videoRisky: false,
				videoCodec: null,
			}),
		);
	}, VIDEO_ID);
	const errors = collectRuntimeErrors(page);

	await page.goto(`/player/series/${encodeURIComponent(VIDEO_ID)}`);
	const screen = page.getByTestId("mpv-screen");
	await expect(screen).toContainText("Playing in mpv", { timeout: 15_000 });
	const requests = () => page.evaluate(() => window.__mpv.requests);
	await expect.poll(requests).toHaveLength(1);
	expect((await requests())[0].url).toBe(STREAM);
	await expect(
		screen.getByRole("button", { name: "Open in mpv again" }),
	).toHaveCount(0);

	await mpvEvent(page, { type: "progress", position: 42, duration: 1800 });
	await mpvEvent(page, { type: "closed", position: 61, duration: 1800 });
	await expect(screen).toContainText("mpv closed");
	await screen.getByRole("button", { name: "Open in mpv again" }).click();
	await expect.poll(requests).toHaveLength(2);
	expect((await requests())[1].start).toBe(61);
	await expect(screen).toContainText("Playing in mpv");

	await mpvEvent(page, {
		type: "closed",
		position: 61,
		duration: 1800,
		failed: true,
	});
	await expect(screen).toContainText("mpv couldn't play this source");

	// Leaving while mpv plays stops it: it runs in a window of its own.
	await screen.getByRole("button", { name: "Open in mpv again" }).click();
	await screen.getByRole("button", { name: "Back" }).click();
	await expect(page).toHaveURL(/\/detail\//);
	await expect.poll(() => page.evaluate(() => window.__mpv.stops)).toBe(1);

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});

// The in-window engine, faked the same way: the page's controls over mpv send
// commands, and mpv's state (its tracks included) comes back as events.
test("desktop: the in-window engine gets the player's volume, audio and subtitle controls", async ({
	page,
	context,
}) => {
	await signIn(context);
	await context.addInitScript((videoId) => {
		window.__engine = { opened: 0, commands: [] };
		window.nuvioDesktop = {
			engine: {
				open: () => {
					window.__engine.opened += 1;
				},
				command: (command) => window.__engine.commands.push(command),
				close: () => undefined,
			},
		};
		sessionStorage.setItem(
			"nuvio:selected-stream",
			JSON.stringify({
				videoId,
				url: "https://cdn.example/episode.mkv",
				externalUrl: null,
				notWebReady: true,
				label: "E2E unplayable",
				addonName: "E2E",
				infoHash: null,
				audioRisky: false,
				videoRisky: false,
				videoCodec: null,
			}),
		);
	}, VIDEO_ID);
	const errors = collectRuntimeErrors(page);

	await page.goto(`/player/series/${encodeURIComponent(VIDEO_ID)}`);
	const engine = page.getByTestId("mpv-engine");
	await expect(engine).toBeVisible({ timeout: 15_000 });
	await expect.poll(() => page.evaluate(() => window.__engine.opened)).toBe(1);
	await page.evaluate(() => {
		window.dispatchEvent(
			new CustomEvent("nuvio:engine", {
				detail: {
					position: 12,
					duration: 1800,
					paused: false,
					buffering: false,
					ended: false,
					volume: 1,
					muted: false,
					tracks: [
						{
							id: 1,
							type: "audio",
							lang: "eng",
							title: "",
							selected: true,
							external: null,
						},
						{
							id: 2,
							type: "audio",
							lang: "fre",
							title: "",
							selected: false,
							external: null,
						},
						{
							id: 1,
							type: "sub",
							lang: "eng",
							title: "",
							selected: false,
							external: null,
						},
					],
				},
			}),
		);
	});
	const commands = () => page.evaluate(() => window.__engine.commands);

	await engine.hover();
	await engine.getByRole("slider", { name: "Volume" }).fill("0.4");
	await expect.poll(commands).toContainEqual({ op: "volume", value: 0.4 });

	await engine.getByRole("button", { name: "Audio" }).click();
	await page.getByRole("menuitemradio", { name: "French" }).click();
	await expect.poll(commands).toContainEqual({ op: "audio", id: 2 });

	await engine.hover();
	await engine.getByRole("button", { name: "Subtitles" }).click();
	await page.getByRole("option", { name: /Embedded/ }).click();
	await expect.poll(commands).toContainEqual({ op: "subtitle", id: 1 });
	await expect(
		engine.getByRole("button", { name: "Picture in picture" }),
	).toHaveCount(0);

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});
