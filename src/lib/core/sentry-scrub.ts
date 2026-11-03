import type { Breadcrumb, ErrorEvent } from "@sentry/browser";

// Addon and stream URLs carry API keys in their path or query: Sentry only gets the origin.
function originOf(url: unknown): string | undefined {
	try {
		return new URL(String(url), globalThis.location?.origin).origin;
	} catch {
		return undefined;
	}
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	if (
		(breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
		breadcrumb.data
	) {
		const {
			"http.query": _query,
			"http.fragment": _fragment,
			...data
		} = breadcrumb.data;
		breadcrumb.data = { ...data, url: originOf(data.url) };
	}
	return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
	if (event.request) {
		event.request.url = originOf(event.request.url);
		event.request.query_string = undefined;
		if (event.request.headers) {
			const { Referer: _referer, ...headers } = event.request.headers;
			event.request.headers = headers;
		}
	}
	return event;
}
