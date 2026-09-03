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
		include: ["src/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"],
		environment: "node",
		coverage: {
			// istanbul, not v8 : `@bcoe/v8-coverage`'s merge step blows the stack
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
				// Page-load data helpers. These used to live in `*.remote.ts` and were
				// measured by the glob above; the loads call them directly now, so the
				// globs follow the code rather than quietly dropping the domain.
				"src/lib/history/*.ts",
				"src/lib/stats/*.ts",
				// `core/` helpers that the server / data layer leans on. Not the
				// whole directory: `motion.ts` reads `window.matchMedia` and
				// `*.svelte.ts` holds runes, both of which are e2e's job.
				"src/lib/core/pool.ts",
				"src/lib/core/images.ts",
				"src/lib/core/url.ts",
				"src/hooks.server.ts",
			],
			exclude: [
				"src/**/*.{test,spec}.ts",
				"src/**/*.d.ts",
				"src/**/index.ts",
				// Svelte rune modules ($state/$effect) can't run in the node env —
				// they're covered by Playwright, not here.
				"src/**/*.svelte.ts",
				// Same reason, without the suffix to say so: every path in this
				// module is behind `browser && typeof indexedDB !== "undefined"`,
				// so in the node env it is unreachable by construction. The store
				// it backs is exercised in `e2e/`.
				"src/lib/sync/idb.ts",
			],
			// Ratchet upward as tests land : do not lower. Target is 100% for the
			// server / remote-function layer (see TODO "CI/CD").
			thresholds: {
				lines: 98,
				functions: 98,
				branches: 90,
				statements: 98,
			},
		},
	},
});
