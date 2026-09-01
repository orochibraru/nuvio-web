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

import { watchProviders } from "./watch-providers.remote.js";
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
});
