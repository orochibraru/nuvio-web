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

// The picker's "remember" switch: "1" or "", and remembered when the field is absent.
const rememberChoice = v.pipe(
	v.optional(v.string(), "1"),
	v.transform((value) => value === "1"),
);

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
	v.object({ profileId: profileIndex, redirectTo, remember: rememberChoice }),
	async ({ profileId, redirectTo: target, remember }) => {
		const { locals } = getRequestEvent();
		const profiles = await locals.nuvio.profiles.list();
		const picked = profiles.find(
			(profile) => profile.profile_index === profileId,
		);
		if (!picked || picked.pin_enabled) {
			redirect(303, resolve("profiles"));
		}
		locals.services.get(SESSION).writeProfileId(profileId, remember);
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
		remember: rememberChoice,
	}),
	async ({ name, avatarId, colorHex, redirectTo: target, remember }, issue) => {
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
		locals.services.get(SESSION).writeProfileId(nextIndex, remember);
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
		if (target.pin_enabled) {
			invalid(issue.name(m.profiles_error_locked()));
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
		const target = existing.find(
			(profile) => profile.profile_index === profileId,
		);
		if (!target) {
			redirect(303, resolve("profiles"));
		}
		if (target.pin_enabled) {
			invalid(issue.profileId(m.profiles_error_locked()));
		}
		if (existing.length <= 1) {
			invalid(issue.profileId(m.profiles_error_last()));
		}

		await locals.nuvio.profiles.deleteData(profileId);
		const accountKey = locals.session?.accountKey;
		if (accountKey !== undefined) {
			locals.services.get(USER_DATA_STORE).clearProfile(accountKey, profileId);
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
