import { invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import type { Profile, ProfileInput } from "#lib/nuvio/index.js";
import {
	clearProfileId,
	readProfileId,
	writeProfileId,
} from "#lib/server/session.js";
import { resolve } from "$app/paths";
import { form, getRequestEvent } from "$app/server";

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
			redirect(303, resolve("profiles"));
		}
		writeProfileId(cookies, profileId);
		redirect(303, resolve("/(protected)/(app)"));
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
		redirect(303, resolve("/(protected)/(app)"));
	},
);

export const updateProfile = form(
	v.object({
		profileId: profileIndex,
		name: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty("Enter a name."),
			v.maxLength(30, "Keep it under 30 characters."),
		),
		colorHex: v.fallback(
			v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
			"#2563EB",
		),
		avatarId: v.optional(v.string()),
		usesPrimaryAddons: v.optional(v.string()),
	}),
	async ({ profileId, name, colorHex, avatarId, usesPrimaryAddons }, issue) => {
		const { locals } = getRequestEvent();
		const existing = await locals.nuvio.profiles.list();
		const target = existing.find(
			(profile) => profile.profile_index === profileId,
		);
		if (!target) {
			invalid(issue.name("That profile no longer exists."));
		}

		const nextUsesPrimary =
			usesPrimaryAddons === undefined
				? target.uses_primary_addons
				: usesPrimaryAddons === "1";

		await locals.nuvio.profiles.replace({
			p_client_max_profiles: MAX_PROFILES,
			p_profiles: existing.map((profile) => {
				if (profile.profile_index !== profileId) {
					return toInput(profile);
				}
				return {
					...toInput(profile),
					name,
					avatar_color_hex: colorHex,
					avatar_id: avatarId ? avatarId : profile.avatar_id,
					uses_primary_addons: nextUsesPrimary,
				};
			}),
		});
		redirect(303, resolve("profiles"));
	},
);

export const deleteProfile = form(
	v.object({ profileId: profileIndex }),
	async ({ profileId }, issue) => {
		if (profileId === 1) {
			invalid(issue.profileId("The primary profile can't be deleted."));
		}
		const { cookies, locals } = getRequestEvent();
		const existing = await locals.nuvio.profiles.list();
		if (!existing.some((profile) => profile.profile_index === profileId)) {
			redirect(303, resolve("profiles"));
		}
		if (existing.length <= 1) {
			invalid(issue.profileId("You need at least one profile."));
		}

		await locals.nuvio.profiles.deleteData(profileId);
		await locals.nuvio.profiles.replace({
			p_client_max_profiles: MAX_PROFILES,
			p_profiles: existing
				.filter((profile) => profile.profile_index !== profileId)
				.map(toInput),
		});

		if (readProfileId(cookies) === profileId) {
			clearProfileId(cookies);
		}

		redirect(303, resolve("profiles"));
	},
);
