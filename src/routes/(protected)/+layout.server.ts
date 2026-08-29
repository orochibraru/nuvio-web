import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.session) {
		redirect(
			303,
			`/auth/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
		);
	}

	return { user: locals.session.user };
};
