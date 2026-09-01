import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scoped to the framework-agnostic units (sync reconcile, addon registry
// helpers, stream formatting) plus the server / remote-function layer.
// Svelte component / SvelteKit integration testing stays in Playwright (e2e/).
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
		},
	},
	test: {
		include: ["src/**/*.{test,spec}.ts"],
		environment: "node",
		coverage: {
			// istanbul, not v8 — `@bcoe/v8-coverage`'s merge step blows the stack
			// on some of these files (bitwise-heavy `safe-fetch.ts`).
			provider: "istanbul",
			reporter: ["text", "html"],
			// The target: full coverage of the server / data layer. UI stays on e2e.
			include: [
				"src/**/*.remote.ts",
				"src/lib/server/**/*.ts",
				"src/lib/sync/**/*.ts",
				"src/lib/addons/*.ts",
				"src/lib/watch/*.ts",
				"src/lib/pool.ts",
				"src/lib/images.ts",
				"src/hooks.server.ts",
			],
			exclude: [
				"src/**/*.{test,spec}.ts",
				"src/**/*.d.ts",
				"src/**/index.ts",
				// Svelte rune modules ($state/$effect) can't run in the node env —
				// they're covered by Playwright, not here.
				"src/**/*.svelte.ts",
			],
			// Ratchet upward as tests land — do not lower. Target is 100% for the
			// server / remote-function layer (see TODO "CI/CD").
			thresholds: {
				lines: 77,
				functions: 72,
				branches: 72,
				statements: 76,
			},
		},
	},
});
