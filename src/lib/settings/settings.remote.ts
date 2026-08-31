import { command } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";
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
