import { defineConfig, devices } from "@playwright/test";

// Reuse the dev server you already have running (`bun run dev` → :5173); only
// spins one up when nothing is listening (e.g. CI).
const PORT = 5173;

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
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
		navigationTimeout: 45_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun run dev",
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
