import { describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { pullSettingsBlob, pullUiSettings } from "./settings-data.ts";
import { DEFAULT_UI_SETTINGS } from "./ui-settings.ts";

function nuvioWith(result: unknown | Error): NuvioClient {
	return {
		settings: {
			pull: vi
				.fn()
				.mockImplementation(() =>
					result instanceof Error
						? Promise.reject(result)
						: Promise.resolve(result),
				),
		},
	} as unknown as NuvioClient;
}

describe("pullSettingsBlob", () => {
	it("returns the first blob's settings_json", async () => {
		const nuvio = nuvioWith([{ settings_json: { ui: { accent: "rose" } } }]);
		expect(await pullSettingsBlob(nuvio, 1)).toEqual({
			ui: { accent: "rose" },
		});
	});

	it("returns {} when there is no blob or the pull fails", async () => {
		expect(await pullSettingsBlob(nuvioWith([]), 1)).toEqual({});
		expect(await pullSettingsBlob(nuvioWith(new Error("x")), 1)).toEqual({});
	});
});

describe("pullUiSettings", () => {
	it("parses stored values and fills the rest from defaults", async () => {
		const nuvio = nuvioWith([
			{ settings_json: { ui: { accent: "green", watchRegion: "GB" } } },
		]);
		const ui = await pullUiSettings(nuvio, 1);
		expect(ui.accent).toBe("green");
		expect(ui.watchRegion).toBe("GB");
		expect(ui.mode).toBe(DEFAULT_UI_SETTINGS.mode);
	});

	it("falls back to full defaults when the pull fails", async () => {
		expect(await pullUiSettings(nuvioWith(new Error("x")), 1)).toEqual(
			DEFAULT_UI_SETTINGS,
		);
	});

	it("drops an unknown region back to auto", async () => {
		const nuvio = nuvioWith([{ settings_json: { ui: { watchRegion: "ZZ" } } }]);
		expect((await pullUiSettings(nuvio, 1)).watchRegion).toBe("auto");
	});
});
