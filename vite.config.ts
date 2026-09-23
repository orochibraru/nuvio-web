import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@orochibraru/svelte-smol";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/i18n/paraglide",
			// No locale in the URL: the cookie the settings page writes, then
			// (client only) the `<html lang>` the server rendered, so hydration
			// agrees with SSR (`#lib/i18n/client.ts`), then the browser's languages
			// (Accept-Language on the server), then English.
			// Mirrored by the `i18n` script (used by `check`) : keep them in sync.
			strategy: [
				"cookie",
				"custom-htmlLang",
				"preferredLanguage",
				"baseLocale",
			],
		}),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				experimental: { async: true },
			},
			adapter: adapter({
				compile: true,
			}),
			experimental: {
				remoteFunctions: true,
				forkPreloads: true,
			},
		}),
	],
});
