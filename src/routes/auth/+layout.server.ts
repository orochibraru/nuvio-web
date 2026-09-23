import { redirect } from "@sveltejs/kit";
import { safeRedirectPath } from "#lib/core/url.js";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.session) {
		redirect(
			303,
			safeRedirectPath(
				url.searchParams.get("redirectTo"),
				resolve("/(protected)/(app)"),
			),
		);
	}
};
