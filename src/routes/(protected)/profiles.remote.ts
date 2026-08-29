import { invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import { form, getRequestEvent } from "$app/server";
import type { Profile, ProfileInput } from "$lib/nuvio/index.js";
import { writeProfileId } from "$lib/server/session.js";

const MAX_PROFILES = 6;

const profileIndex = v.pipe(
	v.string(),
	v.transform(Number),
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(MAX_PROFILES),
);

function toInput(profile: Profile): ProfileInput {
	return {
		profile_index: profile.profile_index,
		name: profile.name,
		avatar_color_hex: profile.avatar_color_hex,
		uses_primary_addons: profile.uses_primary_addons,
		avatar_id: profile.avatar_id,
		avatar_url: profile.avatar_url,
	};
}

export const selectProfile = form(
	v.object({ profileId: profileIndex }),
	async ({ profileId }) => {
		const { cookies, locals } = getRequestEvent();
		const profiles = await locals.nuvio.profiles.list();
		if (!profiles.some((profile) => profile.profile_index === profileId)) {
			redirect(303, "/profiles");
		}
		writeProfileId(cookies, profileId);
		redirect(303, "/");
	},
);

export const createProfile = form(
	v.object({
		name: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty("Enter a name."),
			v.maxLength(30, "Keep it under 30 characters."),
		),
		avatarId: v.optional(v.string()),
		colorHex: v.fallback(
			v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
			"#2563EB",
		),
	}),
	async ({ name, avatarId, colorHex }, issue) => {
		const { cookies, locals } = getRequestEvent();
		const existing = await locals.nuvio.profiles.list();
		if (existing.length >= MAX_PROFILES) {
			invalid(issue.name("You already have the maximum of 6 profiles."));
		}

		const used = new Set(existing.map((profile) => profile.profile_index));
		let nextIndex = 1;
		while (used.has(nextIndex)) {
			nextIndex += 1;
		}

		await locals.nuvio.profiles.replace({
			p_client_max_profiles: MAX_PROFILES,
			p_profiles: [
				...existing.map(toInput),
				{
					profile_index: nextIndex,
					name,
					avatar_color_hex: colorHex,
					avatar_id: avatarId || null,
				},
			],
		});
		writeProfileId(cookies, nextIndex);
		redirect(303, "/");
	},
);
