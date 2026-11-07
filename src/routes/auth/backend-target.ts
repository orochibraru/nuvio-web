/** Where a sign-in goes: official Nuvio, this instance's built-in backend, or another backend. */
export interface BackendTarget {
	kind: "nuvio" | "server" | "other";
	url: string;
}

/**
 * Where the form's backend URL signs in to: official Nuvio when it names the
 * official API, that backend when it names a custom backend the admin
 * allows, else the instance default.
 */
export function targetOf(
	backendUrl: unknown,
	fallback: BackendTarget,
	options: { officialUrl: string; customAllowed: boolean },
): BackendTarget {
	const url = typeof backendUrl === "string" ? backendUrl.trim() : "";
	if (!(url && URL.canParse(url))) {
		return fallback;
	}
	if (url.replace(/\/+$/, "") === options.officialUrl) {
		return { kind: "nuvio", url: options.officialUrl };
	}
	return options.customAllowed ? { kind: "other", url } : fallback;
}

export function hostOf(target: BackendTarget): string {
	return URL.canParse(target.url) ? new URL(target.url).host : target.url;
}
