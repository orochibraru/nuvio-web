import { watchData } from "$lib/watch/watch.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	return { watch: await watchData({ type: params.type, id: params.id }) };
};
