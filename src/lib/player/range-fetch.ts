/**
 * A `fetch` for byte-range reads that survives a redirect losing the `Range`
 * header (WKWebView drops it on a cross-origin redirect, so a debrid link that
 * bounces to its CDN answers 200 with the whole file). Such an answer is
 * cancelled and the range asked of the final URL directly, which is then used
 * for every later read of the same link; a final URL that stops answering
 * (an expired CDN token) falls back to the link itself.
 */
type Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export function createRangeFetch(
	base: Fetch = (input, init) => globalThis.fetch(input, init),
): Fetch {
	const finalUrls = new Map<string, string>();

	return async (input, init) => {
		const range = new Headers(init?.headers).get("Range");
		const link = input instanceof Request ? input.url : String(input);
		if (!range) {
			return base(input, init);
		}
		const known = finalUrls.get(link);
		if (known) {
			const direct = await base(known, init).catch(() => null);
			if (direct?.ok) {
				return direct;
			}
			await direct?.body?.cancel().catch(() => undefined);
			finalUrls.delete(link);
		}
		const response = await base(input, init);
		if (!(response.status === 200 && response.redirected && response.url)) {
			return response;
		}
		await response.body?.cancel().catch(() => undefined);
		const retried = await base(response.url, init);
		if (retried.status === 206) {
			finalUrls.set(link, response.url);
		}
		return retried;
	};
}
