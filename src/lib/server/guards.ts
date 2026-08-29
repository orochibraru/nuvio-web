import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

/** Ensures a signed-in request with an active profile. Throws 401 otherwise. */
export function requireProfile() {
	const event = getRequestEvent();
	if (!event.locals.session || event.locals.profileId == null) {
		error(401, "No active profile");
	}
	return {
		event,
		nuvio: event.locals.nuvio,
		profileId: event.locals.profileId,
	};
}
