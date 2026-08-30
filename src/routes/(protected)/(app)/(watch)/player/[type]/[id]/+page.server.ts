import { playbackContext } from "$lib/watch/watch.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	return {
		context: await playbackContext({ type: params.type, id: params.id }),
	};
};
