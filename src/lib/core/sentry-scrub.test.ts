import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub.ts";

const KEYED =
	"https://addon.example/sk-secret/stream/movie/tt1.json?token=abc#x";

describe("scrubBreadcrumb", () => {
	it("keeps only the origin of fetch and xhr URLs", () => {
		for (const category of ["fetch", "xhr"]) {
			expect(
				scrubBreadcrumb({
					category,
					data: {
						method: "GET",
						url: KEYED,
						"http.query": "?token=abc",
						"http.fragment": "#x",
					},
				}).data,
			).toEqual({ method: "GET", url: "https://addon.example" });
		}
	});

	it("drops a URL it cannot resolve", () => {
		expect(
			scrubBreadcrumb({ category: "fetch", data: { url: "/relative" } }).data,
		).toEqual({ url: undefined });
	});

	it("leaves other breadcrumbs alone", () => {
		const click = { category: "ui.click", message: "button" };
		expect(scrubBreadcrumb({ ...click })).toEqual(click);
	});
});

describe("scrubEvent", () => {
	it("keeps only the origin of the page URL and drops the referrer", () => {
		const event = scrubEvent({
			type: undefined,
			request: {
				url: KEYED,
				query_string: "token=abc",
				headers: { Referer: KEYED, "User-Agent": "ua" },
			},
		});
		expect(event.request).toEqual({
			url: "https://addon.example",
			headers: { "User-Agent": "ua" },
		});
	});

	it("passes an event without a request through", () => {
		expect(scrubEvent({ type: undefined, message: "x" })).toEqual({
			type: undefined,
			message: "x",
		});
	});
});
