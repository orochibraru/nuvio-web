import { error } from "@sveltejs/kit";
import { dev } from "$app/env";
import type { PageServerLoad } from "./$types";

/** Isolated harness for the video player — dev only. */
export const load: PageServerLoad = () => {
	if (!dev) {
		error(404, "Not found");
	}
	return {};
};
