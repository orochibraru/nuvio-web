/** Where a sign-in goes: official Nuvio, this instance's built-in backend, or another host. */
export type BackendTarget =
	| { kind: "nuvio" }
	| { kind: "server" }
	| { kind: "other"; host: string };

/**
 * Where the form's backend URL signs in to: official Nuvio when it names the
 * official API, the URL's host when it names a custom backend the admin
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
		return { kind: "nuvio" };
	}
	return options.customAllowed
		? { kind: "other", host: new URL(url).host }
		: fallback;
}
