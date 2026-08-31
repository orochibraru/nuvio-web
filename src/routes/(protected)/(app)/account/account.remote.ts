import * as v from "valibot";
import { command } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";

export const deleteProfileData = command(
	v.object({ profileIndex: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ profileIndex }) => {
		const { nuvio } = requireProfile();
		await nuvio.profiles.deleteData(profileIndex);
		return { ok: true };
	},
);
