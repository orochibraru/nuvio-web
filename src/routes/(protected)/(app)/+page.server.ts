import { homeRows } from "$lib/addons/addons.remote";
import type { MetaPreview } from "$lib/addons/index.js";
import { libraryItems } from "$lib/library/library.remote";
import { continueWatching } from "$lib/watch/watch.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [rows, library, resume] = await Promise.all([
		homeRows(),
		libraryItems(),
		continueWatching(),
	]);

	// Pull a spotlight from the first rows: needs a backdrop to carry the hero.
	const candidates: MetaPreview[] = rows
		.slice(0, 3)
		.flatMap((row) => row.metas)
		.filter((meta) => Boolean(meta.background));
	const spotlight =
		candidates.length > 0
			? candidates[Math.floor(Math.random() * Math.min(candidates.length, 12))]
			: null;

	return { rows, library, resume, spotlight };
};
