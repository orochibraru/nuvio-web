import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
}));
vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("$lib/server/guards.js", () => ({ requireProfile: () => ({}) }));

import { mediaSegments } from "./segments.remote.js";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
	globalThis.fetch = vi.fn(async () =>
		status === 200
			? new Response(JSON.stringify(body), { status })
			: new Response("err", { status }),
	) as unknown as typeof fetch;
}

describe("mediaSegments", () => {
	it("returns nulls for an unmappable id (no request made)", async () => {
		const spy = vi.fn();
		globalThis.fetch = spy as unknown as typeof fetch;
		expect(
			await mediaSegments({ contentId: "kitsu:42", season: 1, episode: 1 }),
		).toEqual({ intro: null, credits: null });
		expect(spy).not.toHaveBeenCalled();
	});

	it("normalises a successful response", async () => {
		mockFetch(200, {
			intro: [{ start_ms: 77_000, end_ms: 123_000 }],
			credits: [{ start_ms: 2_785_000, end_ms: null }],
		});
		expect(
			await mediaSegments({
				contentId: "tt0903747",
				season: 2,
				episode: 1,
			}),
		).toEqual({ intro: { start: 77, end: 123 }, credits: { start: 2785 } });
	});

	it("resolves to nulls on a 404 / rate limit", async () => {
		mockFetch(404, {});
		expect(
			await mediaSegments({
				contentId: "tt1375666",
				season: null,
				episode: null,
			}),
		).toEqual({ intro: null, credits: null });
	});

	it("resolves to nulls when fetch throws", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("timeout");
		}) as unknown as typeof fetch;
		expect(
			await mediaSegments({
				contentId: "tmdb:550",
				season: null,
				episode: null,
			}),
		).toEqual({ intro: null, credits: null });
	});
});
