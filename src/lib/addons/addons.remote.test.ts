import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
	state: {
		addonsList: vi.fn(),
		addonsReplace: vi.fn(),
		registry: {
			addons: [] as unknown[],
			catalogs: vi.fn(() => [] as unknown[]),
		},
		errors: [] as unknown[],
		invalidateRegistry: vi.fn(),
		owner: vi.fn((profileId: number) => ({
			profileId,
			sharedFrom: null as string | null,
		})),
		fetchManifest: vi.fn(),
		catalogPage: vi.fn(),
		titleMeta: vi.fn(),
		similarToTitle: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock("@sveltejs/kit", () => ({
	error: (status: number, message: string) => {
		throw Object.assign(new Error(message), { status });
	},
}));

vi.mock("$app/server", () => {
	const wrap = (schemaOrFn: unknown, fn?: unknown) => {
		const impl = (fn ?? schemaOrFn) as (...a: unknown[]) => unknown;
		// SvelteKit's `query()` result is awaitable *and* carries `.refresh()`.
		return (...a: unknown[]) =>
			Object.assign(Promise.resolve(impl(...a)), {
				refresh: vi.fn().mockResolvedValue(undefined),
			});
	};
	return {
		query: wrap,
		command: wrap,
		getRequestEvent: () => ({ locals: {}, fetch }),
	};
});

vi.mock("./manifest.ts", () => ({
	fetchManifest: (...a: unknown[]) => state.fetchManifest(...a),
}));

vi.mock("./server.ts", () => ({
	requireProfile: () => ({
		event: {
			locals: {
				nuvio: {
					addons: { list: state.addonsList, replace: state.addonsReplace },
				},
				services: { get: () => ({ warn: state.warn }) },
			},
		},
		profileId: 1,
	}),
	addonOwner: async (_nuvio: unknown, profileId: number) =>
		state.owner(profileId),
	getRegistry: async () => ({ registry: state.registry, errors: state.errors }),
	invalidateRegistry: state.invalidateRegistry,
	catalogPage: state.catalogPage,
	titleMeta: state.titleMeta,
	similarToTitle: state.similarToTitle,
}));

import { pinnedFetch } from "#lib/server/safe-fetch.js";
import {
	browseCatalog,
	getMeta,
	installedAddons,
	previewAddon,
	saveAddons,
	similarTitles,
} from "./addons.remote.ts";

beforeEach(() => {
	state.addonsList.mockReset().mockResolvedValue([]);
	state.addonsReplace.mockReset().mockResolvedValue(undefined);
	state.registry = {
		addons: [],
		catalogs: vi.fn(() => []),
	};
	state.errors = [];
	state.invalidateRegistry.mockReset();
	state.fetchManifest.mockReset();
	state.catalogPage.mockReset().mockResolvedValue({ metas: [], addon: {} });
	state.titleMeta.mockReset().mockResolvedValue(null);
	state.similarToTitle.mockReset().mockResolvedValue({ metas: [] });
});

describe("installedAddons", () => {
	it("sorts by sort_order and derives name + configureUrl from the manifest", async () => {
		state.addonsList.mockResolvedValue([
			{ url: "u2", name: "Two", enabled: true, sort_order: 2 },
			{ url: "u1", name: "One", enabled: false, sort_order: 1 },
		]);
		state.registry = {
			catalogs: vi.fn(() => []),
			addons: [
				{
					url: "u1",
					baseUrl: "https://a.one",
					manifest: {
						name: "Addon One",
						resources: ["catalog", { name: "meta" }],
						catalogs: [{}, {}],
						types: ["movie"],
						behaviorHints: { configurable: true },
					},
				},
			],
		};

		const out = await installedAddons();
		expect(out.addons.map((a) => a.url)).toEqual(["u1", "u2"]);
		expect(out.addons[0]).toMatchObject({
			name: "Addon One",
			enabled: false,
			resources: ["catalog", "meta"],
			catalogCount: 2,
			reachable: true,
			configureUrl: "https://a.one/configure",
		});
		// no manifest in the registry → unreachable, no configure link
		expect(out.addons[1]).toMatchObject({
			name: "Two",
			reachable: false,
			configureUrl: null,
		});
	});
});

describe("previewAddon", () => {
	it("shapes a fetched manifest on success", async () => {
		state.fetchManifest.mockResolvedValue({
			baseUrl: "https://x",
			manifest: {
				id: "org.x",
				name: "X",
				version: "1.0.0",
				resources: ["catalog"],
				types: ["movie"],
				catalogs: [{ type: "movie", id: "top", name: "Top" }],
			},
		});
		const out = await previewAddon("https://x/manifest.json");
		expect(out).toMatchObject({
			ok: true,
			baseUrl: "https://x",
			manifest: { id: "org.x", catalogCount: 1 },
		});
	});

	it("lists a resource the manifest repeats once", async () => {
		state.fetchManifest.mockResolvedValue({
			baseUrl: "https://x",
			manifest: {
				id: "org.x",
				name: "X",
				version: "1.0.0",
				resources: [
					{ name: "stream", types: ["movie"] },
					{ name: "stream", types: ["series"] },
					"meta",
				],
				types: ["movie"],
				catalogs: [],
			},
		});
		const out = await previewAddon("https://x/manifest.json");
		expect(out.ok && out.manifest.resources).toEqual(["stream", "meta"]);
	});

	it("fetches through the pinned, cookie-less transport", async () => {
		state.fetchManifest.mockRejectedValue(new Error("x"));
		await previewAddon("https://x/manifest.json");
		expect(state.fetchManifest).toHaveBeenCalledWith(
			"https://x/manifest.json",
			pinnedFetch,
			{ force: true },
		);
	});

	it("never echoes a network error: that would make it a port scanner", async () => {
		state.warn.mockReset();
		state.fetchManifest.mockRejectedValue(
			new Error("connect ECONNREFUSED 10.0.0.1:6379"),
		);
		expect(await previewAddon("https://x/secret-key/manifest.json")).toEqual({
			ok: false,
			message: "Could not reach this addon.",
		});
		expect(state.warn).toHaveBeenCalledWith("Addon preview failed", {
			origin: "https://x",
			error: "Error: connect ECONNREFUSED 10.0.0.1:6379",
		});
	});

	it("says so when the URL answers with something that isn't a manifest", async () => {
		for (const cause of [
			new Error("Manifest is missing `id`"),
			new Error("Manifest request failed with 404"),
			new SyntaxError("Unexpected token <"),
		]) {
			state.fetchManifest.mockRejectedValue(cause);
			expect(await previewAddon("https://x/manifest.json")).toEqual({
				ok: false,
				message: "That URL doesn't serve a valid addon manifest.",
			});
		}
	});
});

describe("installedAddons, shared", () => {
	it("lists the main profile's rows and names it", async () => {
		state.owner.mockReturnValueOnce({ profileId: 1, sharedFrom: "Main" });
		const out = await installedAddons();
		expect(state.addonsList).toHaveBeenCalledWith(1);
		expect(out.sharedFrom).toBe("Main");
	});
});

describe("saveAddons", () => {
	it("writes a sort-ordered payload and invalidates the registry", async () => {
		const out = await saveAddons([
			{ url: "https://b", enabled: true },
			{ url: "https://a", name: "A", enabled: false },
		]);
		expect(out).toEqual({ count: 2 });
		const payload = state.addonsReplace.mock.calls[0][0].p_addons;
		expect(payload).toEqual([
			{ url: "https://b", name: undefined, enabled: true, sort_order: 0 },
			{ url: "https://a", name: "A", enabled: false, sort_order: 1 },
		]);
		expect(state.invalidateRegistry).toHaveBeenCalled();
	});

	it("refuses a profile whose addons are the main profile's", async () => {
		state.owner.mockReturnValueOnce({ profileId: 1, sharedFrom: "Main" });
		await expect(
			saveAddons([{ url: "https://a", enabled: true }]),
		).rejects.toMatchObject({ status: 403 });
		expect(state.addonsReplace).not.toHaveBeenCalled();
	});
});

describe("browseCatalog / getMeta", () => {
	it("browseCatalog throws 404 when the catalog is missing", async () => {
		state.catalogPage.mockResolvedValue(null);
		await expect(
			browseCatalog({ type: "movie", id: "nope" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("getMeta throws 404 when no addon has metadata", async () => {
		state.titleMeta.mockResolvedValue(null);
		await expect(getMeta({ type: "movie", id: "tt0" })).rejects.toMatchObject({
			status: 404,
		});
	});

	it("getMeta returns what the lookup found", async () => {
		state.titleMeta.mockResolvedValue({
			meta: { name: "M" },
			addonName: "Cinemeta",
		});
		expect(await getMeta({ type: "movie", id: "tt1" })).toEqual({
			meta: { name: "M" },
			addonName: "Cinemeta",
		});
	});
});

// Kept for parity with the load that calls `server.ts` directly. Thin as it
// is, it is a reachable endpoint, so it gets held to the same
// wiring check as the rest.
describe("pass-through queries", () => {
	it("similarTitles forwards the genres", async () => {
		state.similarToTitle.mockResolvedValue({ metas: [{ id: "tt2" }] });
		expect(
			await similarTitles({ type: "movie", id: "tt1", genres: ["Drama"] }),
		).toEqual({ metas: [{ id: "tt2" }] });
		expect(state.similarToTitle).toHaveBeenCalledWith("movie", "tt1", [
			"Drama",
		]);
	});
});
