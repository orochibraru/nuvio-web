import HouseIcon from "@lucide/svelte/icons/house";
import PaletteIcon from "@lucide/svelte/icons/palette";
import PlayIcon from "@lucide/svelte/icons/play";
import PlugIcon from "@lucide/svelte/icons/plug";
import PuzzleIcon from "@lucide/svelte/icons/puzzle";
import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
import type { Component } from "svelte";
import { m } from "#lib/i18n/index.js";

/**
 * The Settings sections, in order.
 *
 * Shared by the page and by the app header's sub-navigation, so the two can
 * never disagree about what exists or what it is called. The section lives in
 * the query string (`?tab=`) rather than in component state, so it survives
 * back / forward and can be linked to.
 */
export interface SettingsSection {
	value: string;
	/** A getter: resolves in the current request's locale on every read. */
	readonly label: string;
	icon: Component;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
	{
		value: "appearance",
		get label() {
			return m.settings_section_appearance();
		},
		icon: PaletteIcon,
	},
	{
		value: "home",
		get label() {
			return m.nav_home();
		},
		icon: HouseIcon,
	},
	{
		value: "playback",
		get label() {
			return m.settings_section_playback();
		},
		icon: PlayIcon,
	},
	{
		value: "sync",
		get label() {
			return m.settings_section_sync();
		},
		icon: RefreshCwIcon,
	},
	{
		value: "addons",
		get label() {
			return m.settings_section_addons();
		},
		icon: PuzzleIcon,
	},
	{
		value: "integrations",
		get label() {
			return m.settings_section_integrations();
		},
		icon: PlugIcon,
	},
] as const;

/** The first section is the default, and is spelled as a bare `/settings`. */
export const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0].value;

/** Narrows an untrusted `?tab=` value to a section that exists. */
export function settingsSectionFrom(raw: string | null): string {
	return (
		SETTINGS_SECTIONS.find((section) => section.value === raw)?.value ??
		DEFAULT_SETTINGS_SECTION
	);
}

/**
 * The query string for one section, as a `?…` suffix. The default section gets
 * no parameter so the canonical Settings URL stays clean.
 */
export function settingsSectionQuery(value: string): string {
	return value === DEFAULT_SETTINGS_SECTION ? "" : `?tab=${value}`;
}
