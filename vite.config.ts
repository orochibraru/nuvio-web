import process from "node:process";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-bun";
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
				buildOptions: {
					compile: true,
				},
			}),
			// SvelteKit 3 reads the origin at build time only. The published image
			// leaves it unset and takes it from the request (`PROTOCOL_HEADER` /
			// `HOST_HEADER` behind a proxy); a build for one known URL, like the
			// e2e server on plain http, bakes it in.
			paths: { origin: process.env.NUVIO_BUILD_ORIGIN },
			experimental: {
				remoteFunctions: true,
				// Off: a hover preload's speculative render can write Svelte's
				// UNINITIALIZED symbol into the DOM ("Cannot convert a Symbol value
				// to a string", sveltejs/svelte#18811) and leave later updates
				// uncommitted. Hover still preloads data. Re-enable once fixed.
				forkPreloads: false,
			},
		}),
	],
});
