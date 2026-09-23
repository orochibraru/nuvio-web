import { Database } from "bun:sqlite";
import { describe, expect, it, vi } from "vitest";
import { NuvioClient } from "#lib/nuvio/index.js";
import {
	Container,
	DATABASE,
	LOGGER,
	Logger,
	NUVIO_TOKENS,
} from "#lib/services/index.js";
import { NuvioSync } from "./nuvio-sync.ts";
import { profileData, registerUserDataServices } from "./server.ts";
import { UserDataStore } from "./store.ts";
import { NUVIO_SYNC, USER_DATA_STORE } from "./tokens.ts";

function container(): Container {
	const db = new Database(":memory:");
	return registerUserDataServices(
		new Container("test")
			.provide(DATABASE, { connect: () => db } as never)
			.provide(LOGGER, new Logger("error", { out() {}, err() {} }))
			.provide(NUVIO_TOKENS, { accessTokenFor: async () => "token" }),
	);
}

describe("registerUserDataServices", () => {
	it("wires the store and the sync as singletons", () => {
		const services = container();
		expect(services.get(USER_DATA_STORE)).toBeInstanceOf(UserDataStore);
		const sync = services.get(NUVIO_SYNC);
		expect(sync).toBeInstanceOf(NuvioSync);
		expect(services.createScope("request").get(NUVIO_SYNC)).toBe(sync);
		services.dispose();
	});

	it("builds a Nuvio client carrying the user's token", async () => {
		const services = container();
		const tokensSeen: Array<string | undefined> = [];
		vi.spyOn(NuvioClient.prototype, "rpc").mockImplementation(async function (
			this: NuvioClient,
		) {
			tokensSeen.push(this.session?.access_token);
			return [] as never;
		});
		services.get(USER_DATA_STORE).applyRemote("u", 1, [], { imported: true });
		await services.get(NUVIO_SYNC).syncUser("u");
		expect(tokensSeen).toContain("token");
		vi.restoreAllMocks();
	});
});

describe("profileData", () => {
	function locals(over: Partial<App.Locals> = {}): App.Locals {
		const services = container();
		const nuvio = { withFetch: vi.fn(() => ({})) };
		return {
			services,
			nuvio,
			session: { user: { id: "u", email: "e", created_at: "" } },
			profileId: 1,
			...over,
		} as unknown as App.Locals;
	}

	it("imports once, then reads the local store", async () => {
		const request = locals();
		const sync = request.services.get(NUVIO_SYNC);
		const ensure = vi.spyOn(sync, "ensureImported").mockResolvedValue(true);
		request.services.get(USER_DATA_STORE).applyWrites("u", 1, [
			{
				entity: "library",
				key: "movie:tt1",
				record: {
					contentId: "tt1",
					contentType: "movie",
					name: "One",
					poster: null,
					background: null,
					description: null,
					releaseInfo: null,
					imdbRating: null,
					genres: [],
					addedAt: 1,
				},
				deleted: false,
				at: 1,
			},
		]);

		const data = profileData(request, fetch);
		expect((await data.library()).map((item) => item.contentId)).toEqual([
			"tt1",
		]);
		expect(await data.progress()).toEqual([]);
		expect(await data.history()).toEqual([]);
		expect(ensure).toHaveBeenCalledTimes(1);
	});

	it("is empty without a session or a profile", async () => {
		expect(
			await profileData(locals({ session: null }), fetch).library(),
		).toEqual([]);
		expect(
			await profileData(locals({ profileId: null }), fetch).progress(),
		).toEqual([]);
	});
});
