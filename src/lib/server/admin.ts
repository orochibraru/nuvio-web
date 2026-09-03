import { error } from "@sveltejs/kit";
import { NUVIO_ADMIN_EMAILS } from "$app/env/private";
import { getRequestEvent } from "$app/server";

/**
 * Server admins are whoever is hosting the instance, named by
 * `NUVIO_ADMIN_EMAILS` and declared in `src/env.ts`. Deliberately *not* stored
 * in the database: the person who can reach the admin page has to be decided
 * by the deployment, not by anything a signed-in user can write.
 *
 * An admin is always allowed to sign in, even when the instance is locked and
 * their address is not on the allowlist : otherwise a typo in the allowlist
 * locks the host out of the page that fixes it.
 */

/**
 * Pure, so the parsing rules can be tested without reaching for the
 * environment : a unit test that read the real variable would pass or fail
 * depending on whoever's `.env` is on the machine.
 */
export function parseAdminEmails(raw: string): string[] {
	return raw
		.split(/[,\s]+/)
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
}

export function adminEmails(): string[] {
	// Declared in `src/env.ts`, which is what makes it readable here at all;
	// non-`static`, so it is read from the environment when the app starts
	// rather than inlined at build time (a container has to configure it).
	return parseAdminEmails(NUVIO_ADMIN_EMAILS ?? "");
}

export function isAdminEmail(email: string | null | undefined): boolean {
	if (!email) {
		return false;
	}
	return adminEmails().includes(email.trim().toLowerCase());
}

/**
 * 404, not 403: the admin surface should not announce itself to a signed-in
 * user who has no business knowing it is there.
 */
export function requireAdmin() {
	const event = getRequestEvent();
	const email = event.locals.session?.user.email;
	if (!isAdminEmail(email)) {
		error(404, "Not found");
	}
	return { event, email: email as string };
}
