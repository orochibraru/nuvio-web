import { redirect } from "@sveltejs/kit";
import { policyOrDefault } from "#lib/admin/backends-data.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { safeRedirectPath } from "#lib/core/url.js";
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
	let defaultTarget: BackendTarget = { kind: "nuvio" };
	if (fallback && locals.services.get(BUILT_IN_BACKEND).owns(fallback)) {
		defaultTarget = { kind: "server" };
	} else if (fallback) {
		defaultTarget = { kind: "other", host: new URL(fallback.url).host };
	}
	return { customBackendsAllowed: policy.customAllowed, defaultTarget };
};
