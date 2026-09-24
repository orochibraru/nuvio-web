import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { expect, type Page, test } from "@playwright/test";
import { Image, write } from "bun";
import { nuvioRpc, signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { waitForImages } from "./util.ts";

/**
 * Screenshots for `docs/showcase.md` and the README : not a correctness suite,
 * but each shot asserts it landed on the right page, so a redirect or an empty
 * screen fails instead of being published. Run with `bun run screenshots`.
 *
 * Nothing copyrighted and nothing torrent-backed goes on screen: the run seeds
 * a "Showcase" profile on the test account whose only addon is the
 * `e2e/showcase-addon` fixture (Blender open movies, CC BY, on Wikimedia
 * Commons), plus a library, progress, history and a collection built from it.
 */

const OUT_DIR = "docs/showcase";
const ADDON_BASE =
	"https://raw.githubusercontent.com/orochibraru/nuvio-web/main/e2e/showcase-addon";
const PROFILE_NAME = "Showcase";

interface FixtureMeta {
	id: string;
	name: string;
	poster: string;
	background: string;
	description: string;
	releaseInfo: string;
	genres: string[];
	runtime: string;
}

const films: FixtureMeta[] = readdirSync("e2e/showcase-addon/meta/movie").map(
	(file) =>
		JSON.parse(readFileSync(`e2e/showcase-addon/meta/movie/${file}`, "utf8"))
			.meta,
);

interface ProfileRow {
	profile_index: number;
	name: string;
	avatar_color_hex: string;
	uses_primary_addons: boolean;
	avatar_id: string | null;
	avatar_url: string | null;
}

/** Finds or creates the showcase profile, keeping every other profile as is. */
async function ensureProfile(): Promise<number> {
	const profiles = await nuvioRpc<ProfileRow[]>("sync_pull_profiles");
	const existing = profiles.find((row) => row.name === PROFILE_NAME);
	if (existing) {
		return existing.profile_index;
	}
	const taken = new Set(profiles.map((row) => row.profile_index));
	const index = [1, 2, 3, 4, 5, 6].find((slot) => !taken.has(slot));
	if (!index) {
		throw new Error("The test account has no free profile slot");
	}
	await nuvioRpc("sync_push_profiles", {
		p_client_max_profiles: 6,
		p_profiles: [
			...profiles.map((row) => ({
				profile_index: row.profile_index,
				name: row.name,
				avatar_color_hex: row.avatar_color_hex,
				uses_primary_addons: row.uses_primary_addons,
				avatar_id: row.avatar_id,
				avatar_url: row.avatar_url,
			})),
			{
				profile_index: index,
				name: PROFILE_NAME,
				avatar_color_hex: "#7C3AED",
				uses_primary_addons: false,
			},
		],
	});
	return index;
}

async function seedProfile(profile: number): Promise<void> {
	const now = Date.now();
	const durationMs = (film: FixtureMeta) =>
		Number.parseInt(film.runtime, 10) * 60_000;
	await nuvioRpc("sync_push_addons", {
		p_profile_id: profile,
		p_addons: [
			{ url: `${ADDON_BASE}/manifest.json`, enabled: true, sort_order: 0 },
		],
	});
	await nuvioRpc("sync_push_library_items", {
		p_profile_id: profile,
		p_items: films.slice(0, 5).map((film, index) => ({
			content_id: film.id,
			content_type: "movie",
			name: film.name,
			poster: film.poster,
			poster_shape: "POSTER",
			background: film.background,
			description: film.description,
			release_info: film.releaseInfo,
			genres: film.genres,
			addon_base_url: ADDON_BASE,
			added_at: now - index * 86_400_000,
		})),
	});
	await nuvioRpc("sync_push_watch_progress", {
		p_profile_id: profile,
		p_entries: films.slice(0, 3).map((film, index) => ({
			content_id: film.id,
			content_type: "movie",
			video_id: film.id,
			position: Math.round(durationMs(film) * (0.3 + index * 0.2)),
			duration: durationMs(film),
			last_watched: now - index * 3_600_000,
		})),
	});
	await nuvioRpc("sync_push_watched_items", {
		p_profile_id: profile,
		p_items: films.map((film, index) => ({
			content_id: film.id,
			content_type: "movie",
			title: film.name,
			watched_at: now - (index + 1) * 2 * 86_400_000 - index * 5_400_000,
		})),
	});
	await nuvioRpc("sync_push_collections", {
		p_profile_id: profile,
		p_collections_json: [
			{
				id: "showcase-blender",
				title: "Blender Studio",
				backdropImageUrl: films[0].background,
				pinToTop: false,
				viewMode: "TABBED_GRID",
				showAllTab: true,
				folders: [
					{
						id: "showcase-open-movies",
						title: "Open movies",
						coverImageUrl: films[1].background,
						coverEmoji: "",
						tileShape: "LANDSCAPE",
						hideTitle: false,
						catalogSources: [
							{
								addonId: "tv.nuvio.showcase",
								type: "movie",
								catalogId: "blender-open-movies",
							},
						],
					},
				],
			},
		],
	});
}

interface Shot {
	name: string;
	path: string;
	/** Query string, kept out of `path` so the landing check compares pathnames. */
	search?: string;
	/** Text the page must show before the shutter: proof it is the right screen. */
	expect?: string;
	/** Defaults to true. Signed-out pages are always dark, so they are shot once. */
	signedIn?: boolean;
	/** Extra steps to reach the state being captured (opening a drawer, etc). */
	prepare?: (page: Page) => Promise<void>;
	/** Extra settle time (ms) before the shot, on top of the shared beat. */
	settleMs?: number;
}

async function hideEmail(page: Page): Promise<void> {
	await page
		.getByText(process.env.NUVIO_TEST_EMAIL ?? "", { exact: true })
		.evaluate((element) => {
			element.textContent = "you@example.com";
		});
}

const shots: Shot[] = [
	{ name: "sign-in", path: "/auth/sign-in", signedIn: false },
	{ name: "sign-up", path: "/auth/sign-up", signedIn: false },
	{ name: "home", path: "/", expect: "Continue watching" },
	{ name: "discover", path: "/discover", expect: "Tears of Steel" },
	{
		name: "search",
		path: "/search",
		search: "?q=blender",
		expect: "Big Buck Bunny",
	},
	{
		name: "detail",
		path: "/detail/movie/blender-sintel",
		expect: "Colin Levy",
	},
	{
		name: "sources-panel",
		path: "/detail/movie/blender-tears-of-steel",
		expect: "Ian Hubert",
		prepare: async (page) => {
			await page
				.getByRole("button", { name: "Select stream", exact: true })
				.click();
			await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
		},
	},
	{ name: "library", path: "/library", expect: "Cosmos Laundromat" },
	{ name: "collections", path: "/collections", expect: "Blender Studio" },
	{
		name: "collection",
		path: "/collections/showcase-blender",
		expect: "Open movies",
	},
	{
		name: "history",
		path: "/account",
		search: "?tab=history",
		expect: "Elephants Dream",
	},
	{ name: "stats", path: "/account", search: "?tab=stats" },
	{ name: "settings", path: "/settings" },
	{
		name: "addons",
		path: "/settings",
		search: "?tab=addons",
		expect: "Blender Open Movies",
	},
	{ name: "account", path: "/account", prepare: hideEmail },
	{ name: "player", path: "/player/movie/blender-spring", settleMs: 3000 },
];

test.use({ viewport: { width: 1440, height: 900 } });
// Idempotent, and re-run whenever a failure restarts the worker, so every shot
// can find its profile without depending on an earlier test having passed.
let profile = 0;
test.beforeAll(async () => {
	profile = await ensureProfile();
	await seedProfile(profile);
});

for (const theme of ["light", "dark"] as const) {
	for (const shot of shots) {
		if (shot.signedIn === false && theme === "light") {
			continue;
		}
		test(`captures ${shot.name} (${theme})`, async ({ page, context }) => {
			if (shot.signedIn !== false) {
				await signIn(context, profile);
			}
			await page.emulateMedia({ colorScheme: theme });
			const errors = collectRuntimeErrors(page);

			await page.goto(shot.path + (shot.search ?? ""));
			// A playing <video> never reaches network idle : don't block on it.
			await page
				.waitForLoadState("networkidle", { timeout: 8000 })
				.catch(() => {});

			// A bounce to the profile picker or sign-in would otherwise be
			// published under this shot's name.
			expect(new URL(page.url()).pathname).toBe(shot.path);
			if (shot.expect) {
				await expect(
					page.getByRole("main").getByText(shot.expect).first(),
				).toBeVisible({ timeout: 20_000 });
			}
			await shot.prepare?.(page);
			await Promise.race([
				waitForImages(page).catch(() => {}),
				page.waitForTimeout(10_000),
			]);
			await page.waitForTimeout(1000 + (shot.settleMs ?? 0));

			// The reserved scrollbar gutter shows as a pale strip down the right edge.
			await page.addStyleTag({
				content:
					"html, body { scrollbar-width: none !important; scrollbar-gutter: auto !important; }",
			});
			const png = await page.screenshot();
			const suffix = theme === "dark" && shot.signedIn !== false ? "-dark" : "";
			await write(
				`${OUT_DIR}/${shot.name}${suffix}.webp`,
				await new Image(png).webp({ quality: 90 }).bytes(),
			);

			expect(errors, `runtime errors on ${shot.path}`).toEqual([]);
		});
	}
}
