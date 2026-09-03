import { beforeEach, describe, expect, it, vi } from "vitest";

// --- harness ----------------------------------------------------------------
// `form(schema, fn)` → the bare handler; `redirect` / `invalid` throw tagged
// objects the tests can assert on; `issue.<field>(msg)` echoes back the message.

class Redirect {
	constructor(
		public status: number,
		public location: string,
	) {}
}
class Invalid {
	constructor(public payload: unknown) {}
}

vi.mock("@sveltejs/kit", () => ({
	redirect: (status: number, location: string) => {
		throw new Redirect(status, location);
	},
	invalid: (payload: unknown) => {
		throw new Invalid(payload);
	},
}));

vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));

const { session, profiles, event } = vi.hoisted(() => {
	const session = {
		writeProfileId: vi.fn(),
		readProfileId: vi.fn<() => number | null>(() => null),
		clearProfileId: vi.fn(),
	};
	const profiles = {
		list: vi.fn(),
		replace: vi.fn(),
		deleteData: vi.fn(),
	};
	return {
		session,
		profiles,
		event: {
			cookies: {},
			locals: { nuvio: { profiles } } as Record<string, unknown>,
		},
	};
});

vi.mock("$app/server", () => ({
	form: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => event,
}));

const issue = new Proxy(
	{},
	{ get: (_t, field: string) => (msg: string) => ({ field, msg }) },
) as Record<string, (msg: string) => unknown>;

import { Container, SESSION } from "#lib/services/index.js";
import * as profileForms from "./profiles.remote.js";

// The handlers resolve SessionService off the request scope, so the fake goes
// in through a real container rather than a module mock.
event.locals.services = new Container("test").provide(
	SESSION,
	session as never,
);

// `form(...)` results aren't callable in their public type; drive the handler.
type FormHandler = (
	data: Record<string, unknown>,
	issue: Record<string, (msg: string) => unknown>,
) => Promise<unknown>;
const selectProfile = profileForms.selectProfile as unknown as FormHandler;
const createProfile = profileForms.createProfile as unknown as FormHandler;
const updateProfile = profileForms.updateProfile as unknown as FormHandler;
const deleteProfile = profileForms.deleteProfile as unknown as FormHandler;

function profile(index: number, over: Record<string, unknown> = {}) {
	return {
		profile_index: index,
		name: `P${index}`,
		avatar_color_hex: "#000000",
		uses_primary_addons: true,
		avatar_id: null,
		avatar_url: null,
		...over,
	};
}

beforeEach(() => {
	for (const fn of Object.values(session)) {
		fn.mockReset();
	}
	session.readProfileId.mockReturnValue(null);
	profiles.list.mockReset().mockResolvedValue([profile(1)]);
	profiles.replace.mockReset().mockResolvedValue(undefined);
	profiles.deleteData.mockReset().mockResolvedValue(undefined);
});

describe("selectProfile", () => {
	it("writes the cookie and enters the app for a known profile", async () => {
		profiles.list.mockResolvedValue([profile(1), profile(2)]);
		await expect(selectProfile({ profileId: 2 }, issue)).rejects.toMatchObject({
			location: "/(protected)/(app)",
		});
		expect(session.writeProfileId).toHaveBeenCalledWith(2);
	});

	it("bounces back to the picker for an unknown profile", async () => {
		await expect(selectProfile({ profileId: 5 }, issue)).rejects.toMatchObject({
			location: "profiles",
		});
		expect(session.writeProfileId).not.toHaveBeenCalled();
	});
});

describe("createProfile", () => {
	it("fills the first free index and selects the new profile", async () => {
		profiles.list.mockResolvedValue([profile(1), profile(3)]);
		await expect(
			createProfile(
				{ name: "New", avatarId: undefined, colorHex: "#123456" },
				issue,
			),
		).rejects.toBeInstanceOf(Redirect);

		const arg = profiles.replace.mock.calls[0][0];
		expect(arg.p_profiles.at(-1)).toMatchObject({
			profile_index: 2,
			name: "New",
			avatar_color_hex: "#123456",
		});
		expect(session.writeProfileId).toHaveBeenCalledWith(2);
	});

	it("refuses a seventh profile", async () => {
		profiles.list.mockResolvedValue([1, 2, 3, 4, 5, 6].map((i) => profile(i)));
		await expect(
			createProfile({ name: "New", colorHex: "#123456" }, issue),
		).rejects.toMatchObject({
			payload: { field: "name", msg: expect.stringContaining("maximum") },
		});
	});
});

describe("updateProfile", () => {
	it("merges the edited fields into just the target profile", async () => {
		profiles.list.mockResolvedValue([profile(1), profile(2)]);
		await expect(
			updateProfile(
				{
					profileId: 2,
					name: "Renamed",
					colorHex: "#abcdef",
					avatarId: undefined,
					usesPrimaryAddons: "0",
				},
				issue,
			),
		).rejects.toBeInstanceOf(Redirect);

		const next = profiles.replace.mock.calls[0][0].p_profiles;
		expect(next[0]).toMatchObject({ profile_index: 1, name: "P1" });
		expect(next[1]).toMatchObject({
			name: "Renamed",
			avatar_color_hex: "#abcdef",
			uses_primary_addons: false,
		});
	});

	it("errors when the target is gone", async () => {
		profiles.list.mockResolvedValue([profile(1)]);
		await expect(
			updateProfile({ profileId: 4, name: "X", colorHex: "#abcdef" }, issue),
		).rejects.toMatchObject({ payload: { field: "name" } });
	});
});

describe("deleteProfile", () => {
	it("never deletes the primary profile", async () => {
		await expect(deleteProfile({ profileId: 1 }, issue)).rejects.toMatchObject({
			payload: { field: "profileId" },
		});
		expect(profiles.deleteData).not.toHaveBeenCalled();
	});

	it("removes the profile and clears the cookie if it was active", async () => {
		profiles.list.mockResolvedValue([profile(1), profile(2)]);
		session.readProfileId.mockReturnValue(2);

		await expect(deleteProfile({ profileId: 2 }, issue)).rejects.toMatchObject({
			location: "profiles",
		});
		expect(profiles.deleteData).toHaveBeenCalledWith(2);
		expect(profiles.replace.mock.calls[0][0].p_profiles).toHaveLength(1);
		expect(session.clearProfileId).toHaveBeenCalled();
	});

	it("won't delete the last remaining profile", async () => {
		profiles.list.mockResolvedValue([profile(2)]);
		await expect(deleteProfile({ profileId: 2 }, issue)).rejects.toMatchObject({
			payload: {
				field: "profileId",
				msg: expect.stringContaining("at least one"),
			},
		});
	});
});
