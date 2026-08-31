import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.session) {
		const target = url.searchParams.get("redirectTo");
		const safe =
			target?.startsWith("/") && !target.startsWith("//")
				? target
				: resolve("/(protected)/(app)");
		redirect(303, safe);
	}
};
