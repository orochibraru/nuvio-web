import { titleMeta } from "#lib/addons/server.js";
import { pullCalendar } from "#lib/library/calendar-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	const lookupMeta = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;
	return {
		entries: pullCalendar(profileData(locals, fetch), lookupMeta).catch(
			() => [],
		),
	};
};
