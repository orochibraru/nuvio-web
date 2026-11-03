import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	deleteData: vi.fn(),
	clearProfile: vi.fn(),
	list: vi.fn(),
};

vi.mock("@sveltejs/kit", () => ({
	error: (status: number, message: string) => {
		throw Object.assign(new Error(message), { status });
	},
}));

vi.mock("$app/server", () => ({
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: {
			locals: {
				services: { get: () => ({ clearProfile: state.clearProfile }) },
			},
			fetch,
		},
		nuvio: {
			profiles: { deleteData: state.deleteData, list: state.list },
		},
		profileId: 5,
		accountKey: "u",
	}),
}));

import { deleteProfileData } from "./account.remote.js";

beforeEach(() => {
	state.deleteData = vi.fn(async () => undefined);
	state.clearProfile = vi.fn();
	state.list = vi.fn(async () => [{ profile_index: 2, pin_enabled: false }]);
});

describe("deleteProfileData", () => {
	it("wipes the given profile's data and reports ok", async () => {
		const out = await deleteProfileData({ profileIndex: 2 });
		expect(state.deleteData).toHaveBeenCalledWith(2);
		expect(state.clearProfile).toHaveBeenCalledWith("u", 2);
		expect(state.deleteData.mock.invocationCallOrder[0]).toBeLessThan(
			state.clearProfile.mock.invocationCallOrder[0],
		);
		expect(out).toEqual({ ok: true });
	});

	it("refuses a PIN-locked profile", async () => {
		state.list = vi.fn(async () => [{ profile_index: 2, pin_enabled: true }]);
		await expect(deleteProfileData({ profileIndex: 2 })).rejects.toMatchObject({
			status: 403,
		});
		expect(state.deleteData).not.toHaveBeenCalled();
	});

	it("propagates a failure from the underlying call", async () => {
		state.deleteData = vi.fn(async () => {
			throw new Error("wipe failed");
		});
		await expect(deleteProfileData({ profileIndex: 1 })).rejects.toThrow(
			"wipe failed",
		);
		expect(state.clearProfile).not.toHaveBeenCalled();
	});
});
