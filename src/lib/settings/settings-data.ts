import * as v from "valibot";
import type { NuvioClient } from "$lib/nuvio/index.js";
import { PLATFORM, type UiSettings, uiSettingsSchema } from "./ui-settings.ts";

/** The raw `web` settings blob for a profile, or `{}` on any failure. */
export async function pullSettingsBlob(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Record<string, unknown>> {
	const blobs = await nuvio.settings
		.pull({ p_profile_id: profileId, p_platform: PLATFORM })
		.catch(() => []);
	return (blobs[0]?.settings_json ?? {}) as Record<string, unknown>;
}

/**
 * UI settings for SSR / first paint. Gates every `(app)` page through the layout
 * load, so a slow / failed pull falls back to defaults rather than stalling or
 * 500-ing the shell — the client `theme` controller re-syncs once it's up.
 */
export async function pullUiSettings(
	nuvio: NuvioClient,
	profileId: number,
): Promise<UiSettings> {
	const blob = await pullSettingsBlob(nuvio, profileId);
	return v.parse(uiSettingsSchema, blob.ui ?? {});
}
