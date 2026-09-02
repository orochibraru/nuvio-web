import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { deleteData: vi.fn() };

vi.mock("$app/server", () => ({
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: { profiles: { deleteData: state.deleteData } },
		profileId: 5,
	}),
}));

import { deleteProfileData } from "./account.remote.js";

beforeEach(() => {
	state.deleteData = vi.fn(async () => undefined);
});

describe("deleteProfileData", () => {
	it("wipes the given profile's data and reports ok", async () => {
		const out = await deleteProfileData({ profileIndex: 2 });
		expect(state.deleteData).toHaveBeenCalledWith(2);
		expect(out).toEqual({ ok: true });
	});

	it("propagates a failure from the underlying call", async () => {
		state.deleteData = vi.fn(async () => {
			throw new Error("wipe failed");
		});
		await expect(deleteProfileData({ profileIndex: 1 })).rejects.toThrow(
			"wipe failed",
		);
	});
});
