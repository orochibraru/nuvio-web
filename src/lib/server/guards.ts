import { error } from "@sveltejs/kit";
import { m } from "#lib/i18n/index.js";
import { ADMIN } from "#lib/services/index.js";
import { getRequestEvent } from "$app/server";

/**
 * Route guards. Both read the request's service scope off `locals`, which
 * `hooks.server.ts` builds per request.
 */

/** Ensures a signed-in request with an active profile. Throws 401 otherwise. */
export function requireProfile() {
	const event = getRequestEvent();
	if (!event.locals.session || event.locals.profileId == null) {
		error(401, m.error_no_active_profile());
	}
	return {
		event,
		nuvio: event.locals.nuvio,
		profileId: event.locals.profileId,
		userId: event.locals.session.user.id,
	};
}

/**
 * 404, not 403: the admin surface should not announce itself to a signed-in
 * user who has no business knowing it is there.
 */
export function requireAdmin() {
	const event = getRequestEvent();
	const email = event.locals.session?.user.email;
	if (!event.locals.services.get(ADMIN).isAdmin(email)) {
		error(404, m.error_not_found());
	}
	return { event, email: email as string };
}
