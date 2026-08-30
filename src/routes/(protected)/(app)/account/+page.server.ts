import type { PageServerLoad } from "./$types";
import { syncOverview } from "./account.remote";

export const load: PageServerLoad = async () => {
	return { overview: await syncOverview() };
};
