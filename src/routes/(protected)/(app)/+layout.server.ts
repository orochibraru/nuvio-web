import { redirect } from "@sveltejs/kit";
import { getUiSettings } from "$lib/settings/settings.remote";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	const { profiles } = await parent();
	const profile =
		profiles?.find((entry) => entry.profile_index === locals.profileId) ?? null;

	if (!profile) {
		redirect(303, "/profiles");
	}

	const ui = await getUiSettings();
	return { profile, ui };
};
