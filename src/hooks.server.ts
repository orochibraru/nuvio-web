import type { Handle } from "@sveltejs/kit/hooks";
import { NuvioApiError, NuvioClient } from "#lib/nuvio/index.js";
import {
	clearStoredSession,
	createServerClient,
	isExpired,
	readProfileId,
	readStoredSession,
	writeStoredSession,
} from "#lib/server/session.js";

export const handle: Handle = async ({ event, resolve }) => {
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
