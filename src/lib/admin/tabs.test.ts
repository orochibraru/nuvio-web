import { describe, expect, it } from "vitest";
import { adminTabSearch, parseAdminTab } from "./tabs.ts";

describe("admin tabs", () => {
	it("reads a known tab from the query string", () => {
		expect(parseAdminTab("backends")).toBe("backends");
		expect(parseAdminTab("notifications")).toBe("notifications");
		expect(parseAdminTab("settings")).toBe("settings");
	});

	it("falls back to the dashboard for a missing or unknown tab", () => {
		expect(parseAdminTab(null)).toBe("dashboard");
		expect(parseAdminTab("")).toBe("dashboard");
		expect(parseAdminTab("toString")).toBe("dashboard");
	});

	it("keeps the dashboard URL bare", () => {
		expect(adminTabSearch("dashboard")).toBe("");
		expect(adminTabSearch("settings")).toBe("?tab=settings");
	});
});
