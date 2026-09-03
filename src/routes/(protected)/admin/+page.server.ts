import { isLocked, listAllowlist, listSignIns } from "#lib/admin/admin-data.js";
import { requireAdmin } from "#lib/server/guards.js";
import { ADMIN, DATABASE } from "#lib/services/index.js";
import type { PageServerLoad } from "./$types";

/**
 * Every read is local SQLite, so this load stays awaited rather than streamed :
 * there is no network in it to hide behind a skeleton.
 */
export const load: PageServerLoad = () => {
	const { event } = requireAdmin();
	const db = event.locals.services.get(DATABASE).connect();
	return {
		signIns: listSignIns(db),
		allowlist: listAllowlist(db),
		locked: isLocked(db),
		admins: [...event.locals.services.get(ADMIN).emails],
	};
};
