export const ADMIN_TABS = [
	"dashboard",
	"backends",
	"notifications",
	"settings",
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export function parseAdminTab(value: string | null): AdminTab {
	return ADMIN_TABS.find((tab) => tab === value) ?? "dashboard";
}

export function adminTabSearch(tab: AdminTab): string {
	return tab === "dashboard" ? "" : `?tab=${tab}`;
}
