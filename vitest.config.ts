import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
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
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["src/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"],
					exclude: ["src/**/*.svelte.test.ts"],
					environment: "node",
				},
			},
			{
				// Rune modules (`$state` in a `.svelte.ts`) need the Svelte compiler.
				// Still the node env, not a DOM shim: the one module this exists for
				// (the sync store) touches IndexedDB, `BroadcastChannel` (native in
				// Node), `navigator.onLine` and `document`'s visibility event. The
				// setup file provides the first and last; nothing else needs a DOM.
				extends: true,
				plugins: [svelte()],
				resolve: { conditions: ["browser"] },
				test: {
					name: "runes",
					include: ["src/**/*.svelte.test.ts"],
					environment: "node",
					setupFiles: ["./src/lib/sync/test-setup.ts"],
				},
			},
		],
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
				// Downloads: the pure planning / path / range logic and the proxy.
				// The worker, the manager and the IndexedDB store run only in a
				// browser (OPFS, workers) : e2e covers those.
				"src/lib/downloads/hls.ts",
				"src/lib/downloads/files.ts",
				"src/lib/downloads/subtitles.ts",
				"src/routes/api/**/+server.ts",
				// `core/` helpers that the server / data layer leans on. Not the
				// whole directory: `motion.ts` reads `window.matchMedia` and
				// `*.svelte.ts` holds runes, both of which are e2e's job.
				"src/lib/core/pool.ts",
				"src/lib/core/images.ts",
				"src/lib/core/url.ts",
				"src/hooks.server.ts",
				// Rune modules the `runes` project covers. Named one by one rather
				// than un-excluding `*.svelte.ts`: most of those are UI state that
				// only e2e can meaningfully exercise.
				"src/lib/sync/store.svelte.ts",
				"src/lib/sync/persist.svelte.ts",
			],
			exclude: [
				"src/**/*.{test,spec}.ts",
				"src/**/*.d.ts",
				"src/**/index.ts",
				"src/**/*.svelte.test.ts",
				// Rune modules that are UI state, not logic: e2e covers them. Named
				// rather than globbed (`src/**/*.svelte.ts`), because exclude beats
				// include here and a glob would also drop the sync store the
				// `runes` project exists to cover.
				"src/lib/watch/*.svelte.ts",
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
