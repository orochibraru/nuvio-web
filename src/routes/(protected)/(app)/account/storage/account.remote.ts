import * as v from "valibot";
import { requireProfile } from "#lib/server/guards.js";
import { USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { command } from "$app/server";

export const deleteProfileData = command(
	v.object({ profileIndex: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ profileIndex }) => {
		const { event, nuvio, userId } = requireProfile();
		// Nuvio first: a sync pulling between the two then only finds tombstones.
		await nuvio.profiles.deleteData(profileIndex);
		event.locals.services
			.get(USER_DATA_STORE)
			.clearProfile(userId, profileIndex);
		return { ok: true };
	},
);
