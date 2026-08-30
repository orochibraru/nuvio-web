import { catalogList } from "$lib/addons/addons.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	// Only the catalog list (addon manifests, cached) is awaited for SSR — the
	// actual catalog contents load client-side with a skeleton so a slow addon
	// never stalls first paint.
	const catalogs = await catalogList();
	const key = url.searchParams.get("c");
	const genre = url.searchParams.get("g") ?? "";

	const selected =
		catalogs.find(
			(entry) => `${entry.addonId}|${entry.type}|${entry.id}` === key,
		) ?? catalogs[0];

	return {
		catalogs,
		genre,
		selectedKey: selected
			? `${selected.addonId}|${selected.type}|${selected.id}`
			: null,
	};
};
