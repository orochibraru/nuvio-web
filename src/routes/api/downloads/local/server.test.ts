import { describe, expect, it, vi } from "vitest";
import { LOCAL_DOWNLOADS } from "#lib/downloads/tokens.js";
import { Container } from "#lib/services/index.js";
import { GET } from "./+server.ts";

describe("GET /api/downloads/local", () => {
	it("answers the profile's downloads, uncached", async () => {
		const list = vi.fn(async () => [{ id: "a" }]);
		const queue = { folder: "/downloads", list, free: async () => null };
		const response = (await GET({
			locals: {
				services: new Container("test").provide(
					LOCAL_DOWNLOADS,
					queue as never,
				),
				session: { accountKey: "account-1" },
				profileId: 3,
			},
		} as never)) as Response;

		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			items: [{ id: "a" }],
			folder: "/downloads",
			free: null,
		});
		expect(list).toHaveBeenCalledWith("account-1:3");
	});
});
