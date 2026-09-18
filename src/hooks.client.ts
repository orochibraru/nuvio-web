import type { HandleClientError } from "@sveltejs/kit/hooks";
import { makeErrorId } from "#lib/core/error-id.js";
import { dev } from "$app/env";

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = makeErrorId();

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
		message: "Whoops!",
	};
};
