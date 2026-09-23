import {
	defineCustomClientStrategy,
	isLocale,
} from "#lib/i18n/paraglide/runtime.js";

/**
 * The client's answer when there's no locale cookie yet: the `<html lang>` the
 * server rendered with (see `server.ts`). Without it the client would fall to
 * `navigator.languages`, which can disagree with the Accept-Language the
 * server read, and hydrate English markup with French copy. Runs before
 * `preferredLanguage` in the strategy list (vite.config.ts / the `i18n`
 * script). The first `getLocale()` then writes the cookie, so every later
 * request agrees too.
 */
export function defineHtmlLangStrategy(root: { lang: string }): void {
	defineCustomClientStrategy("custom-htmlLang", {
		getLocale: () => (isLocale(root.lang) ? root.lang : undefined),
		setLocale: (locale) => {
			root.lang = locale;
		},
	});
}
