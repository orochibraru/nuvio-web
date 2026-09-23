import { invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import { safeRedirectPath } from "#lib/core/url.js";
import { profileName } from "#lib/forms/schemas.js";
import { m } from "#lib/i18n/index.js";
import type { Profile, ProfileInput } from "#lib/nuvio/index.js";
import { SESSION } from "#lib/services/index.js";
import { USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { resolve } from "$app/paths";
import { form, getRequestEvent } from "$app/server";

const MAX_PROFILES = 6;

const redirectTo = v.optional(v.string(), "");

/** Only allow same-origin path redirects; anything else → the app root. */
function safeTarget(value: string | undefined): string {
	return safeRedirectPath(value, resolve("/(protected)/(app)"));
}

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
	v.object({ profileId: profileIndex, redirectTo }),
	async ({ profileId, redirectTo: target }) => {
		const { locals } = getRequestEvent();
		const profiles = await locals.nuvio.profiles.list();
		if (!profiles.some((profile) => profile.profile_index === profileId)) {
			redirect(303, resolve("profiles"));
		}
		locals.services.get(SESSION).writeProfileId(profileId);
		redirect(303, safeTarget(target));
	},
);

export const createProfile = form(
	v.object({
		name: profileName,
		avatarId: v.optional(v.string()),
		colorHex: v.fallback(
			v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
			"#2563EB",
		),
		redirectTo,
	}),
	async ({ name, avatarId, colorHex, redirectTo: target }, issue) => {
		const { locals } = getRequestEvent();
		const existing = await locals.nuvio.profiles.list();
		if (existing.length >= MAX_PROFILES) {
			invalid(issue.name(m.profiles_error_limit()));
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
		locals.services.get(SESSION).writeProfileId(nextIndex);
		redirect(303, safeTarget(target));
	},
);

export const updateProfile = form(
	v.object({
		profileId: profileIndex,
		name: profileName,
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
			invalid(issue.name(m.profiles_error_gone()));
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
			invalid(issue.profileId(m.profiles_error_primary()));
		}
		const { locals } = getRequestEvent();
		const existing = await locals.nuvio.profiles.list();
		if (!existing.some((profile) => profile.profile_index === profileId)) {
			redirect(303, resolve("profiles"));
		}
		if (existing.length <= 1) {
			invalid(issue.profileId(m.profiles_error_last()));
		}

		await locals.nuvio.profiles.deleteData(profileId);
		const userId = locals.session?.user.id;
		if (userId !== undefined) {
			locals.services.get(USER_DATA_STORE).clearProfile(userId, profileId);
		}
		await locals.nuvio.profiles.replace({
			p_client_max_profiles: MAX_PROFILES,
			p_profiles: existing
				.filter((profile) => profile.profile_index !== profileId)
				.map(toInput),
		});

		const session = locals.services.get(SESSION);
		if (session.readProfileId() === profileId) {
			session.clearProfileId();
		}

		redirect(303, resolve("profiles"));
	},
);
