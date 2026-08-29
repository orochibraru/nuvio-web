import { browseCatalog, catalogList } from "$lib/addons/addons.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const catalogs = await catalogList();
	const key = url.searchParams.get("c");
	const genre = url.searchParams.get("g") ?? "";

	const selected =
		catalogs.find(
			(entry) => `${entry.addonId}|${entry.type}|${entry.id}` === key,
		) ?? catalogs[0];

	const firstPage = selected
		? await browseCatalog({
				addonId: selected.addonId,
				type: selected.type,
				id: selected.id,
				genre: genre || undefined,
			})
		: null;

	return {
		catalogs,
		genre,
		selectedKey: selected
			? `${selected.addonId}|${selected.type}|${selected.id}`
			: null,
		firstPage,
	};
};
