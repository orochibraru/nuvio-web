import type { HandleClientError } from "@sveltejs/kit/hooks";
import { dev } from "$app/env";

function makeid(length: number) {
	let result = "";
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < length; i += 1) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = makeid(24);

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
