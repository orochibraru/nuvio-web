import type { Locale } from "#lib/i18n/paraglide/runtime.js";

export { m } from "#lib/i18n/paraglide/messages.js";
export {
	getLocale,
	type Locale,
	locales,
	setLocale,
} from "#lib/i18n/paraglide/runtime.js";

/** Each locale in its own language: what the switcher lists, never translated. */
export const localeNames = {
	en: "English",
	fr: "Français",
	es: "Español",
	de: "Deutsch",
} as const satisfies Record<Locale, string>;
