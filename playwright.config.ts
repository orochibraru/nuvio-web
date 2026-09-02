import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

// Tests run against a *production* build (`bun run build && bun run start`),
// not `vite dev` : the dev server's cold-start compile made CI flaky and timed
// the whole run out. Locally an already-running server on :3000 is reused.
const PORT = 3000;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "e2e",
	// Every test signs in against the real api.nuvio.tv and page loads fan out to
	// it plus third-party Stremio addons. Parallel runs trip Cloudflare's rate
	// limit (HTTP 1015 / 429 / dropped sockets); slow upstreams stall SSR +
	// networkidle. So: run serially, allow generous timeouts, share one auth token
	// across the run (see e2e/auth.ts), and keep retries low locally.
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 1,
	workers: 1,
	timeout: 60_000,
	reporter: "list",
	use: {
		baseURL: ORIGIN,
		trace: "retain-on-failure",
		navigationTimeout: 45_000,
	},
	projects: [
		{
			name: "chromium",
			testIgnore: /showcase\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
		// Dedicated showcase-screenshot sequence : deliberately excluded from the
		// default `chromium` project (and so from `bun run test:e2e`). Run it on
		// its own with `bun run screenshots`.
		{
			name: "showcase",
			testMatch: /showcase\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run build && bun run start",
		url: ORIGIN,
		reuseExistingServer: !process.env.CI,
		// A cold `vite build` plus compiling the ~65 MB standalone binary is well
		// over a minute on a CI runner.
		timeout: 240_000,
		env: {
			// The adapter derives the request origin from the Host header and
			// assumes `https://` unless told otherwise, so SvelteKit's CSRF check
			// saw `https://localhost:3000` against the browser's
			// `Origin: http://localhost:3000` and rejected every remote function
			// with 403 "Cross-site remote requests are forbidden".
			ORIGIN,
			// Unlocks the `/dev/player` harness on a production build. Only ever
			// set here : see `src/routes/dev/player/+page.server.ts`.
			NUVIO_E2E: "1",
		},
	},
});
