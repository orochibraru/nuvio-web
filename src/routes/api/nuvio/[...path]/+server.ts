import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import type { RequestHandler } from "./$types";

/** The built-in Nuvio backend: its own auth (apikey + bearer JWT), never the app session. */
export const fallback: RequestHandler = ({
	request,
	locals,
	getClientAddress,
}) => locals.services.get(BUILT_IN_BACKEND).handle(request, getClientAddress());
