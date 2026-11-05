import { redirect } from "@sveltejs/kit";
import { policyOrDefault } from "#lib/admin/backends-data.js";
import { safeRedirectPath } from "#lib/core/url.js";
import { NUVIO_BASE_URL } from "#lib/nuvio/index.js";
import { DATABASE } from "#lib/services/index.js";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.session) {
		redirect(
			303,
			safeRedirectPath(
				url.searchParams.get("redirectTo"),
				resolve("/(protected)/(app)"),
			),
		);
	}
	const policy = policyOrDefault(locals.services.get(DATABASE).tryConnect());
	return {
		customBackendsAllowed: policy.customAllowed,
		// The admin's replacement for the official API, offered first.
		defaultBackendHost: policy.defaultBackend
			? new URL(policy.defaultBackend.url).host
			: null,
		officialBackendUrl: NUVIO_BASE_URL,
	};
};
