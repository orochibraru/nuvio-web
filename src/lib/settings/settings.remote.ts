import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { command, getRequestEvent, query } from "$app/server";
import {
	PLATFORM,
	UI_VERSION,
	type UiSettings,
	uiSettingsSchema,
} from "./ui-settings.ts";

function requireProfile() {
	const event = getRequestEvent();
	if (!event.locals.session || event.locals.profileId == null) {
		error(401, "No active profile");
	}
	return { nuvio: event.locals.nuvio, profileId: event.locals.profileId };
}

async function pullBlob(
	nuvio: ReturnType<typeof requireProfile>["nuvio"],
	profileId: number,
): Promise<Record<string, unknown>> {
	const blobs = await nuvio.settings.pull({
		p_profile_id: profileId,
		p_platform: PLATFORM,
	});
	return (blobs[0]?.settings_json ?? {}) as Record<string, unknown>;
}

export const getUiSettings = query(async (): Promise<UiSettings> => {
	const { nuvio, profileId } = requireProfile();
	const blob = await pullBlob(nuvio, profileId);
	return v.parse(uiSettingsSchema, blob.ui ?? {});
});

export const saveUiSettings = command(uiSettingsSchema, async (ui) => {
	const { nuvio, profileId } = requireProfile();
	const blob = await pullBlob(nuvio, profileId);
	await nuvio.settings.replace({
		p_profile_id: profileId,
		p_platform: PLATFORM,
		p_settings_json: { ...blob, ui, uiVersion: UI_VERSION },
	});
	await getUiSettings().refresh();
	return ui;
});
