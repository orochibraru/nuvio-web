import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";
import { pullUiSettings } from "$lib/settings/settings-data.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, parent, fetch }) => {
	const { profiles } = await parent();
	const profile =
		profiles?.find((entry) => entry.profile_index === locals.profileId) ?? null;

	if (!profile || locals.profileId == null) {
		redirect(303, resolve("/profiles"));
	}

	const ui = await pullUiSettings(
		locals.nuvio.withFetch(fetch),
		locals.profileId,
	);
	return { profile, ui };
};
