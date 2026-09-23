import type { Handle } from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/i18n/paraglide/server.js";

/**
 * Resolves the request's locale (cookie → Accept-Language → "en") and scopes
 * it to the request, so `m.*()` and `getLocale()` answer for this visitor during
 * SSR. Rewrites app.html's `<html lang="en">` so `lang` matches the rendered
 * copy (a literal default rather than a `%lang%` placeholder keeps app.html
 * valid HTML for Biome and for a request that never reaches this hook).
 *
 * The middleware's rewritten request is ignored: SvelteKit 3's `event.request`
 * is read-only, and with no `url` strategy there is nothing to de-localize.
 */
export const i18nHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ locale }) =>
		resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('<html lang="en"', `<html lang="${locale}"`),
		}),
	);
