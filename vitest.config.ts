import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scoped to the framework-agnostic units (sync reconcile, addon registry helpers).
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
	},
});
