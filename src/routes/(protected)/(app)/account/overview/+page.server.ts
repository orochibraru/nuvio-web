import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
	builtInAccount: locals.services.get(BUILT_IN_BACKEND).ownsSession(locals),
});
