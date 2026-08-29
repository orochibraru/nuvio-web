import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.session) {
		const target = url.searchParams.get("redirectTo");
		redirect(
			303,
			target?.startsWith("/") && !target.startsWith("//") ? target : "/",
		);
	}
};
