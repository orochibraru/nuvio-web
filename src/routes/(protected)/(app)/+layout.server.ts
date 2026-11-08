import { redirect } from "@sveltejs/kit";
import { LOCAL_DOWNLOADS } from "#lib/downloads/tokens.js";
import {
	pullAppAudioLanguage,
	pullUiSettings,
} from "#lib/settings/settings-data.js";
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

	if (!profile || locals.profileId == null || profile.pin_enabled) {
		// Carry the destination through the profile picker so a shared link
		// (`/detail/...`) lands where it meant to, not on a generic home feed.
		const target = url.pathname + url.search;
		const suffix =
			target && target !== "/"
				? `?redirectTo=${encodeURIComponent(target)}`
				: "";
		redirect(303, resolve("profiles") + suffix);
	}

	// Neither pull rejects : each falls back to defaults on its own.
	const nuvio = locals.nuvio.withFetch(fetch);
	const [ui, appAudio] = await Promise.all([
		pullUiSettings(nuvio, locals.profileId),
		pullAppAudioLanguage(nuvio, locals.profileId),
	]);
	// Downloads go to a folder on this computer (the desktop app), not the browser.
	const downloadsOnDisk = locals.services.get(LOCAL_DOWNLOADS) !== null;
	return { profile, ui, appAudio, downloadsOnDisk };
};
