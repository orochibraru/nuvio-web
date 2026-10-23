import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
import CircleUserIcon from "@lucide/svelte/icons/circle-user";
import ClockIcon from "@lucide/svelte/icons/clock";
import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
import { m } from "#lib/i18n/index.js";
import type { SettingsSection } from "#lib/settings/sections.js";
import { resolve } from "$app/paths";

/**
 * The Account sections, in order : shared by the page and the app header's
 * sub-navigation, like `SETTINGS_SECTIONS`. Each is a page at `/account/<value>`.
 */
export const ACCOUNT_SECTIONS: readonly SettingsSection[] = [
	{
		value: "overview",
		get href() {
			return resolve("account/overview");
		},
		get label() {
			return m.account_tab_overview();
		},
		get description() {
			return m.account_section_overview_description();
		},
		icon: CircleUserIcon,
	},
	{
		value: "history",
		get href() {
			return resolve("account/history");
		},
		get label() {
			return m.nav_watch_history();
		},
		get description() {
			return m.account_section_history_description();
		},
		icon: ClockIcon,
	},
	{
		value: "stats",
		get href() {
			return resolve("account/stats");
		},
		get label() {
			return m.account_tab_stats();
		},
		get description() {
			return m.account_section_stats_description();
		},
		icon: ChartColumnIcon,
	},
	{
		value: "storage",
		get href() {
			return resolve("account/storage");
		},
		get label() {
			return m.account_tab_storage();
		},
		get description() {
			return m.account_section_storage_description();
		},
		icon: HardDriveIcon,
	},
] as const;
