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

	// Featured carousel: titles from the first rows that have a backdrop to carry
	// the hero. Dedupe by id, shuffle, cap at 6.
	const seen = new Set<string>();
	const candidates: MetaPreview[] = rows
		.slice(0, 4)
		.flatMap((row) => row.metas)
		.filter((meta) => {
			if (!meta.background || seen.has(meta.id)) {
				return false;
			}
			seen.add(meta.id);
			return true;
		});
	for (let i = candidates.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
	}
	const spotlights = candidates.slice(0, 6);

	return { rows, library, resume, spotlights };
};
