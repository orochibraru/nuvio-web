import process from "node:process";
import { error } from "@sveltejs/kit";
import { dev } from "$app/env";
import type { PageServerLoad } from "./$types";

/**
 * Isolated harness for the video player : dev only, plus the Playwright run,
 * which drives it against a production build (`playwright.config.ts` sets
 * `NUVIO_E2E` on the server it starts). Nothing sets it in a real deploy, so
 * the route stays a 404 there.
 *
 * Read straight off `process.env` rather than `$env/dynamic/private`: SvelteKit
 * only serves variables it knows about at build time from that module, so an
 * undeclared name comes back `undefined` and the guard folds to a bare 404.
 */
export const load: PageServerLoad = () => {
	if (!(dev || process.env.NUVIO_E2E)) {
		error(404, "Not found");
	}
	return {};
};
