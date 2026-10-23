import HouseIcon from "@lucide/svelte/icons/house";
import PaletteIcon from "@lucide/svelte/icons/palette";
import PlayIcon from "@lucide/svelte/icons/play";
import PlugIcon from "@lucide/svelte/icons/plug";
import PuzzleIcon from "@lucide/svelte/icons/puzzle";
import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
import type { Component } from "svelte";
import { m } from "#lib/i18n/index.js";
import { resolve } from "$app/paths";

/**
 * The Settings sections, in order.
 *
 * Shared by the page and by the app header's sub-navigation, so the two can
 * never disagree about what exists or what it is called. Each section is its
 * own page, at `/settings/<value>`.
 */
export interface SettingsSection {
	value: string;
	/** A getter too: on the server `resolve` is relative to the request's URL. */
	readonly href: string;
	/** A getter: resolves in the current request's locale on every read. */
	readonly label: string;
	/** One line under the label in the phone settings list. */
	readonly description: string;
	icon: Component;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
	{
		value: "appearance",
		get href() {
			return resolve("settings/appearance");
		},
		get label() {
			return m.settings_section_appearance();
		},
		get description() {
			return m.settings_section_appearance_description();
		},
		icon: PaletteIcon,
	},
	{
		value: "home",
		get href() {
			return resolve("settings/home");
		},
		get label() {
			return m.nav_home();
		},
		get description() {
			return m.settings_section_home_description();
		},
		icon: HouseIcon,
	},
	{
		value: "playback",
		get href() {
			return resolve("settings/playback");
		},
		get label() {
			return m.settings_section_playback();
		},
		get description() {
			return m.settings_section_playback_description();
		},
		icon: PlayIcon,
	},
	{
		value: "sync",
		get href() {
			return resolve("settings/sync");
		},
		get label() {
			return m.settings_section_sync();
		},
		get description() {
			return m.settings_section_sync_description();
		},
		icon: RefreshCwIcon,
	},
	{
		value: "addons",
		get href() {
			return resolve("settings/addons");
		},
		get label() {
			return m.settings_section_addons();
		},
		get description() {
			return m.settings_section_addons_description();
		},
		icon: PuzzleIcon,
	},
	{
		value: "integrations",
		get href() {
			return resolve("settings/integrations");
		},
		get label() {
			return m.settings_section_integrations();
		},
		get description() {
			return m.settings_section_integrations_description();
		},
		icon: PlugIcon,
	},
] as const;
