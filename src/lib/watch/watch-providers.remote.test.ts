import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	fetch: vi.fn(),
	acceptLanguage: null as string | null,
};

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({
		fetch: state.fetch,
		request: {
			headers: {
				get: (name: string) =>
					name === "accept-language" ? state.acceptLanguage : null,
			},
		},
	}),
}));

vi.mock("#lib/server/guards.js", () => ({ requireProfile: () => ({}) }));

import { watchProviders } from "./watch-providers.remote.ts";
import { EMPTY_PROVIDERS } from "./watch-providers.ts";

beforeEach(() => {
	state.acceptLanguage = null;
	state.fetch = vi.fn(async () => ({ ok: false }) as Response);
});

describe("watchProviders", () => {
	it("resolves to EMPTY on a non-ok response", async () => {
		expect(
			await watchProviders({
				title: "Dune",
				year: 2021,
				imdbId: null,
				region: "US",
			}),
		).toEqual(EMPTY_PROVIDERS);
	});

	it("resolves to EMPTY when the fetch throws", async () => {
		state.fetch = vi.fn(async () => {
			throw new Error("network");
		});
		expect(
			await watchProviders({
				title: "Dune",
				year: null,
				imdbId: null,
				region: null,
			}),
		).toEqual(EMPTY_PROVIDERS);
	});

	it("uses an explicit region over Accept-Language", async () => {
		state.acceptLanguage = "fr-FR";
		await watchProviders({
			title: "Dune",
			year: null,
			imdbId: null,
			region: "de",
		});
		const body = JSON.parse(state.fetch.mock.calls[0][1].body);
		expect(body.variables.country).toBe("DE");
	});

	it("falls back to Accept-Language for region 'auto'", async () => {
		state.acceptLanguage = "fr-FR,fr;q=0.9";
		await watchProviders({
			title: "Dune",
			year: null,
			imdbId: null,
			region: "auto",
		});
		const body = JSON.parse(state.fetch.mock.calls[0][1].body);
		expect(body.variables.country).toBe("FR");
	});

	it("shapes the matched node's offers", async () => {
		state.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				data: {
					popularTitles: {
						edges: [
							null,
							{ node: null },
							{
								node: {
									content: {
										title: "Dune",
										originalReleaseYear: 2021,
										fullPath: "/us/movie/dune-2021",
										externalIds: { imdbId: "tt1160419" },
									},
									offers: [
										{
											monetizationType: "FLATRATE",
											standardWebURL: "https://max.com/dune",
											package: {
												clearName: "Max",
												technicalName: "max",
												icon: "/icon/1/{profile}/{format}",
											},
										},
										{
											monetizationType: "RENT",
											standardWebURL: "https://apple.com/dune",
											package: { clearName: "Apple TV", technicalName: "atv" },
										},
									],
								},
							},
						],
					},
				},
			}),
		})) as never;

		const result = await watchProviders({
			title: "Dune",
			year: 2021,
			imdbId: "tt1160419",
			region: "US",
		});

		expect(result.network).toBe("Max");
		expect(result.stream).toHaveLength(1);
		expect(result.rent[0]).toMatchObject({
			provider: "Apple TV",
			kind: "rent",
		});
		expect(result.justWatchUrl).toBe(
			"https://www.justwatch.com/us/movie/dune-2021",
		);
	});

	it("resolves to EMPTY when the response carries no edges", async () => {
		state.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({ data: {} }),
		})) as never;

		expect(
			await watchProviders({
				title: "Dune",
				year: null,
				imdbId: null,
				region: "US",
			}),
		).toEqual(EMPTY_PROVIDERS);
	});
});
