import { requireProfile } from "#lib/server/guards.js";
import { command } from "$app/server";
import { homeLayoutSchema } from "./home-layout.ts";
import { pullSettingsBlob } from "./settings-data.ts";
import { PLATFORM, UI_VERSION, uiSettingsSchema } from "./ui-settings.ts";

export const saveUiSettings = command(uiSettingsSchema, async (ui) => {
	const { nuvio, profileId } = requireProfile();
	const blob = await pullSettingsBlob(nuvio, profileId);
	await nuvio.settings.replace({
		p_profile_id: profileId,
		p_platform: PLATFORM,
		p_settings_json: { ...blob, ui, uiVersion: UI_VERSION },
	});
	return ui;
});

/** Replaces the web home layout. An empty layout restores the default home. */
export const saveHomeLayout = command(homeLayoutSchema, async (layout) => {
	const { nuvio, profileId } = requireProfile();
	await nuvio.homeCatalog.replace({
		p_profile_id: profileId,
		p_platform: PLATFORM,
		p_settings_json: layout,
	});
	return layout;
});
