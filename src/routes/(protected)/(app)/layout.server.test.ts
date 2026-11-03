import { describe, expect, it, vi } from "vitest";

vi.mock("@sveltejs/kit", () => ({
	redirect: (status: number, location: string) => {
		throw Object.assign(new Error(location), { status, location });
	},
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("#lib/settings/settings-data.js", () => ({
	pullUiSettings: async () => ({ marker: "ui" }),
	pullAppAudioLanguage: async () => null,
}));

import { load } from "./+layout.server.ts";

function call(profileId: number | null, pinEnabled = false) {
	return load({
		locals: { profileId, nuvio: { withFetch: () => ({}) } },
		parent: async () => ({
			profiles: [{ profile_index: 2, pin_enabled: pinEnabled }],
		}),
		fetch,
		url: new URL("http://localhost/library"),
	} as never);
}

describe("(app) layout", () => {
	it("loads the selected profile", async () => {
		await expect(call(2)).resolves.toMatchObject({
			profile: { profile_index: 2 },
		});
	});

	it("sends a missing or PIN-locked profile to the picker", async () => {
		const picker = { status: 303, location: "profiles?redirectTo=%2Flibrary" };
		await expect(call(null)).rejects.toMatchObject(picker);
		await expect(call(3)).rejects.toMatchObject(picker);
		await expect(call(2, true)).rejects.toMatchObject(picker);
	});
});
