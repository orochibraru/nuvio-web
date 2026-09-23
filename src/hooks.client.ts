import type { HandleClientError } from "@sveltejs/kit/hooks";
import { makeErrorId } from "#lib/core/error-id.js";
import { defineHtmlLangStrategy } from "#lib/i18n/client.js";
import { m } from "#lib/i18n/index.js";
import { dev } from "$app/env";

// Before anything calls `getLocale()`: hydration must speak the language the
// server rendered.
defineHtmlLangStrategy(document.documentElement);

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = makeErrorId();

	// A fetch failing while the browser says it's offline is the expected
	// outcome, not a bug : the layout's banner already says so.
	if (!navigator.onLine && error instanceof TypeError) {
		return { errorId, message: m.error_offline() };
	}

	// The id is the only handle the user has on this error : it's what the error
	// page shows them, so it has to be in the log line they (or we) go looking
	// through, or the id they report matches nothing anywhere.
	// biome-ignore lint/suspicious/noConsole: client-side error log, found by the errorId shown on the error page
	console.error(`Client error ${errorId}:`, error, event);

	if (dev) {
		if (error instanceof Error) {
			return {
				errorId,
				message: error.message,
			};
		}

		return {
			errorId,
			message: String(error),
		};
	}

	return {
		errorId,
		message: m.error_whoops(),
	};
};
