import { redirect } from "@sveltejs/kit";
import { policyOrDefault } from "#lib/admin/backends-data.js";
import { BUILT_IN_MOUNT } from "#lib/backend/handler.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { safeRedirectPath } from "#lib/core/url.js";
import { NUVIO_BASE_URL } from "#lib/nuvio/index.js";
import { DATABASE } from "#lib/services/index.js";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";
import type { BackendTarget } from "./backend-target.ts";

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
	const fallback = policy.defaultBackend;
	let defaultTarget: BackendTarget = { kind: "nuvio", url: NUVIO_BASE_URL };
	if (fallback && locals.services.get(BUILT_IN_BACKEND).owns(fallback)) {
		// The stored URL keeps the origin it was saved from; this request's is the live one.
		defaultTarget = { kind: "server", url: `${url.origin}${BUILT_IN_MOUNT}` };
	} else if (fallback) {
		defaultTarget = { kind: "other", url: fallback.url };
	}
	return {
		customBackendsAllowed: policy.customAllowed,
		defaultTarget,
		// Offered as its own choice when the admin replaced it as the default.
		officialBackendUrl: NUVIO_BASE_URL,
	};
};
