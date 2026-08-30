import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
	testDir: "e2e",
	// Every test signs in against the real api.nuvio.tv and page loads fan out to
	// it plus third-party Stremio addons. Parallel runs trip Cloudflare's rate
	// limit (HTTP 1015 / dropped sockets); slow upstreams stall SSR + networkidle.
	// So: run serially, allow generous timeouts, and retry a flaked test twice.
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 2,
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
		command: `bunx --bun vite dev --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
