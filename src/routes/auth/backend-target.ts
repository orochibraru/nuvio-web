/** Where a sign-in goes: official Nuvio, this instance's built-in backend, or another host. */
export type BackendTarget =
	| { kind: "nuvio" }
	| { kind: "server" }
	| { kind: "other"; host: string };

/** The custom backend URL's host when one is set, else the instance default. */
export function targetOf(
	customUrl: unknown,
	fallback: BackendTarget,
): BackendTarget {
	const url = typeof customUrl === "string" ? customUrl.trim() : "";
	if (url && URL.canParse(url)) {
		return { kind: "other", host: new URL(url).host };
	}
	return fallback;
}
