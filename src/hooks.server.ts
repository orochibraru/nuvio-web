import { NuvioApiError, NuvioClient } from "$lib/nuvio/index.js";
import {
	clearStoredSession,
	createServerClient,
	isExpired,
	readProfileId,
	readStoredSession,
	writeStoredSession,
} from "$lib/server/session.js";

function makeErrorId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export function handleError({ event, error, status }) {
	if (status === 404) {
		return;
	}
	const errorId = makeErrorId();
	console.error(
		`Error on ${event.request.method} ${event.url.pathname} (errorId=${errorId})`,
		error,
	);

	return {
		errorId,
		message:
			error instanceof Error ? error.message : "An unknown error occurred.",
	};
}

export const handle = async ({ event, resolve }) => {
	let stored = readStoredSession(event.cookies);

	if (stored && isExpired(stored)) {
		try {
			const refreshed = await new NuvioClient({
				fetch: event.fetch,
			}).refreshSession(stored.refresh_token);
			stored = writeStoredSession(event.cookies, refreshed);
		} catch (error) {
			if (!(error instanceof NuvioApiError)) throw error;
			clearStoredSession(event.cookies);
			stored = null;
		}
	}

	event.locals.session = stored ? { user: stored.user } : null;
	event.locals.profileId = stored ? readProfileId(event.cookies) : null;
	event.locals.nuvio = createServerClient(event, stored);

	return resolve(event);
};
