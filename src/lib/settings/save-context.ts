import { createContext } from "svelte";
import type { UiSettings } from "#lib/settings/ui-settings.js";

/**
 * The settings layout's save: previews a UI settings patch, saves it, and shows
 * the outcome next to the section heading. Each section page reads it here.
 */
export const [getSettingsUpdate, setSettingsUpdate] =
	createContext<(patch: Partial<UiSettings>) => Promise<void>>();
