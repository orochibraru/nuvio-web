/** Where a sign-in goes: official Nuvio, this instance's built-in backend, or another backend. */
export interface BackendTarget {
	kind: "nuvio" | "server" | "other";
	url: string;
}

/** The custom backend URL when one is set, else the instance default. */
export function targetOf(
	customUrl: unknown,
	fallback: BackendTarget,
): BackendTarget {
	const url = typeof customUrl === "string" ? customUrl.trim() : "";
	if (url && URL.canParse(url)) {
		return { kind: "other", url };
	}
	return fallback;
}

export function hostOf(target: BackendTarget): string {
	return URL.canParse(target.url) ? new URL(target.url).host : target.url;
}
