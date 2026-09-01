import { redirect } from "@sveltejs/kit";
import { pullUiSettings } from "#lib/settings/settings-data.js";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
	locals,
	parent,
	fetch,
	url,
}) => {
	const { profiles } = await parent();
	const profile =
		profiles?.find((entry) => entry.profile_index === locals.profileId) ?? null;

	if (!profile || locals.profileId == null) {
		// Carry the destination through the profile picker so a shared link
		// (`/detail/...`) lands where it meant to, not on a generic home feed.
		const target = url.pathname + url.search;
		const suffix =
			target && target !== "/"
				? `?redirectTo=${encodeURIComponent(target)}`
				: "";
		redirect(303, resolve("profiles") + suffix);
	}

	const ui = await pullUiSettings(
		locals.nuvio.withFetch(fetch),
		locals.profileId,
	);
	return { profile, ui };
};
