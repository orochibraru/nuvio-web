import { redirect } from "@sveltejs/kit";
import { toProfileView } from "$lib/profile.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.session) {
		redirect(
			303,
			`/auth/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
		);
	}

	const [profiles, avatars] = await Promise.all([
		locals.nuvio.profiles.list(),
		locals.nuvio.listAvatars(),
	]);
	const catalog = new Map(avatars.map((entry) => [entry.id, entry]));

	return {
		user: locals.session.user,
		profileId: locals.profileId,
		profiles: profiles
			.sort((a, b) => a.profile_index - b.profile_index)
			.map((profile) =>
				toProfileView(profile, catalog, (path) => locals.nuvio.avatarUrl(path)),
			),
		avatarCatalog: avatars
			.filter((entry) => entry.is_active)
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((entry) => ({
				id: entry.id,
				name: entry.display_name,
				url: locals.nuvio.avatarUrl(entry.storage_path),
				bgColor: entry.bg_color,
			})),
	};
};
