import { describe, expect, it } from "vitest";
import { AdminService } from "./admin.service.ts";

// The service takes the raw variable rather than reading the environment, so
// none of this needs `$app/env/private` mocked and none of it passes or fails
// depending on whoever's `.env` is on the machine.

describe("AdminService.parse", () => {
	it("is empty when the variable is unset, so nobody is an admin by default", () => {
		expect(AdminService.parse("")).toEqual([]);
	});

	it("splits on commas and whitespace and folds case", () => {
		expect(
			AdminService.parse(
				" One@Example.com,two@example.com \n THREE@example.com ",
			),
		).toEqual(["one@example.com", "two@example.com", "three@example.com"]);
	});

	it("drops the empty entries a trailing comma leaves behind", () => {
		expect(AdminService.parse("a@example.com,,")).toEqual(["a@example.com"]);
	});
});

describe("isAdmin", () => {
	it("treats a missing email as not an admin", () => {
		const admin = new AdminService("someone@example.com");
		expect(admin.isAdmin(null)).toBe(false);
		expect(admin.isAdmin(undefined)).toBe(false);
		expect(admin.isAdmin("")).toBe(false);
	});

	it("nobody is an admin when the allowlist is empty", () => {
		expect(new AdminService("").isAdmin("anyone@example.com")).toBe(false);
	});

	it("matches an allowlisted address regardless of case or padding", () => {
		const admin = new AdminService("Host@Example.com, other@example.com");
		expect(admin.isAdmin("host@example.com")).toBe(true);
		expect(admin.isAdmin("  HOST@EXAMPLE.COM  ")).toBe(true);
		expect(admin.isAdmin("nobody@example.invalid")).toBe(false);
	});
});
