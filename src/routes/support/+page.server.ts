import type { PageServerLoad } from "./$types";
import { supporterWall } from "./support.remote";

export const load: PageServerLoad = async ({ locals }) => {
	return {
		wall: await supporterWall(0),
		signedIn: Boolean(locals.session),
	};
};
