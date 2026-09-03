import { isLocked, listAllowlist, listSignIns } from "#lib/admin/admin-data.js";
import { adminEmails, requireAdmin } from "#lib/server/admin.js";
import { getDb } from "#lib/server/db.js";
import type { PageServerLoad } from "./$types";

/**
 * Every read is local SQLite, so this load stays awaited rather than streamed :
 * there is no network in it to hide behind a skeleton.
 */
export const load: PageServerLoad = () => {
	requireAdmin();
	const db = getDb();
	return {
		signIns: listSignIns(db),
		allowlist: listAllowlist(db),
		locked: isLocked(db),
		admins: adminEmails(),
	};
};
