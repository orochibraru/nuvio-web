import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { m } from "#lib/i18n/index.js";
import { requireProfile } from "#lib/server/guards.js";
import { USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { command } from "$app/server";

export const deleteProfileData = command(
	v.object({ profileIndex: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ profileIndex }) => {
		const { event, nuvio, accountKey } = requireProfile();
		const profiles = await nuvio.profiles.list();
		if (
			profiles.find((profile) => profile.profile_index === profileIndex)
				?.pin_enabled
		) {
			error(403, m.profiles_error_locked());
		}
		// Nuvio first: a sync pulling between the two then only finds tombstones.
		await nuvio.profiles.deleteData(profileIndex);
		event.locals.services
			.get(USER_DATA_STORE)
			.clearProfile(accountKey, profileIndex);
		return { ok: true };
	},
);
