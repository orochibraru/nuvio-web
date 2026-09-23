import * as v from "valibot";
import { m } from "#lib/i18n/index.js";

// Form schemas shared by remote functions (a `.remote.ts` may export only
// remote functions). Messages are functions so they render in the request's
// locale, not the one active when this module loaded.

const email = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty(() => m.auth_error_email_required()),
	v.email(() => m.common_email_invalid()),
);
const redirectTo = v.optional(v.string(), "/");

export const signInSchema = v.object({
	email,
	password: v.pipe(
		v.string(),
		v.nonEmpty(() => m.auth_error_password_required()),
	),
	redirectTo,
});

export const signUpSchema = v.object({
	email,
	password: v.pipe(
		v.string(),
		v.minLength(8, () => m.auth_error_password_short()),
	),
	redirectTo,
});

/** A profile name, as both the create and the edit form take it. */
export const profileName = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty(() => m.profiles_error_name_required()),
	v.maxLength(30, () => m.profiles_error_name_long()),
);

/** An addon manifest URL typed into Settings → Addons. */
export const addonUrl = v.pipe(
	v.string(),
	v.trim(),
	v.url(() => m.settings_addons_invalid_url()),
);
