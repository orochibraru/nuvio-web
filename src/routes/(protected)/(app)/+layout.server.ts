import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	const { profiles } = await parent();
	const profile =
		profiles?.find((entry) => entry.profile_index === locals.profileId) ?? null;

	if (!profile) {
		redirect(303, "/profiles");
	}

	return { profile };
};
