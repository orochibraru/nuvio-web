import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
import CircleUserIcon from "@lucide/svelte/icons/circle-user";
import ClockIcon from "@lucide/svelte/icons/clock";
import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
import { m } from "#lib/i18n/index.js";
import type { SettingsSection } from "#lib/settings/sections.js";

/**
 * The Account sections, in order : shared by the page and the app header's
 * sub-navigation, like `SETTINGS_SECTIONS`. The section lives in `?tab=`.
 */
export const ACCOUNT_SECTIONS: readonly SettingsSection[] = [
	{
		value: "overview",
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
		get label() {
			return m.account_tab_storage();
		},
		get description() {
			return m.account_section_storage_description();
		},
		icon: HardDriveIcon,
	},
] as const;

/** Narrows an untrusted `?tab=` value to a section that exists. */
export function accountSectionFrom(raw: string | null): string {
	return (
		ACCOUNT_SECTIONS.find((section) => section.value === raw)?.value ??
		ACCOUNT_SECTIONS[0].value
	);
}

/** `?tab=` for one section; the default one keeps a bare `/account`. */
export function accountSectionQuery(value: string): string {
	return value === ACCOUNT_SECTIONS[0].value ? "" : `?tab=${value}`;
}
