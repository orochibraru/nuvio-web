import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uiSettingsSchema } from "./ui-settings.ts";

const state = { settingsPull: vi.fn(), settingsReplace: vi.fn() };

vi.mock("$app/server", () => ({
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: {
			settings: { pull: state.settingsPull, replace: state.settingsReplace },
		},
		profileId: 3,
	}),
}));

import { saveUiSettings } from "./settings.remote.js";

const defaults = v.parse(uiSettingsSchema, {});

beforeEach(() => {
	state.settingsPull = vi.fn(async () => []);
	state.settingsReplace = vi.fn(async () => undefined);
});

describe("saveUiSettings", () => {
	it("merges the ui block into the existing blob and stamps the version", async () => {
		state.settingsPull = vi.fn(async () => [
			{ settings_json: { keepThis: true, ui: { accent: "old" } } },
		]);

		const next = { ...defaults, accent: "blue" as const };
		const out = await saveUiSettings(next);

		expect(out).toEqual(next);
		expect(state.settingsReplace).toHaveBeenCalledWith({
			p_profile_id: 3,
			p_platform: "web",
			p_settings_json: { keepThis: true, ui: next, uiVersion: 1 },
		});
	});

	it("still writes when there's no prior blob", async () => {
		await saveUiSettings(defaults);
		expect(state.settingsReplace).toHaveBeenCalledWith(
			expect.objectContaining({
				p_settings_json: { ui: defaults, uiVersion: 1 },
			}),
		);
	});
});
