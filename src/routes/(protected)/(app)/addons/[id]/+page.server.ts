import { error } from "@sveltejs/kit";
import {
	decodeAddonId,
	installedAddonId,
	isInstalledAddonId,
} from "#lib/addons/directory.js";
import {
	type AddonDetails,
	addonDetails,
	installedAddonRows,
} from "#lib/addons/server.js";
import { m } from "#lib/i18n/index.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, locals, fetch }) => {
	const rows = installedAddonRows(
		locals.nuvio.withFetch(fetch),
		locals.profileId ?? 0,
	).catch(() => null);
	const failed = (): AddonDetails => ({ ok: false, reason: "unreachable" });

	if (isInstalledAddonId(params.id)) {
		return {
			url: null,
			details: rows
				.then((list) => {
					const row = list?.find(
						(entry) => installedAddonId(entry.url) === params.id,
					);
					return row
						? addonDetails(row.url)
						: ({ ok: false, reason: 404 } satisfies AddonDetails);
				})
				.catch(failed),
			rows,
		};
	}

	const url = decodeAddonId(params.id);
	if (!url) {
		error(404, m.error_not_found());
	}
	return { url, details: addonDetails(url).catch(failed), rows };
};
