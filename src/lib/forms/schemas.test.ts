import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { m } from "#lib/i18n/index.js";
import {
	addonUrl,
	profileName,
	signInSchema,
	signUpSchema,
} from "./schemas.ts";

/** The first issue's message, as the form would show it. */
function message(schema: v.GenericSchema, input: unknown): string | undefined {
	const result = v.safeParse(schema, input);
	return result.success ? undefined : result.issues[0]?.message;
}

describe("form schemas", () => {
	it("rejects sign-in fields with the translated messages", () => {
		expect(message(signInSchema, { email: " ", password: "x" })).toBe(
			m.auth_error_email_required(),
		);
		expect(message(signInSchema, { email: "nope", password: "x" })).toBe(
			m.common_email_invalid(),
		);
		expect(message(signInSchema, { email: "a@b.co", password: "" })).toBe(
			m.auth_error_password_required(),
		);
		expect(v.parse(signInSchema, { email: " a@b.co ", password: "x" })).toEqual(
			{ email: "a@b.co", password: "x", redirectTo: "/" },
		);
	});

	it("wants an 8-character password on sign-up", () => {
		expect(message(signUpSchema, { email: "a@b.co", password: "short" })).toBe(
			m.auth_error_password_short(),
		);
	});

	it("bounds a profile name", () => {
		expect(message(profileName, "   ")).toBe(m.profiles_error_name_required());
		expect(message(profileName, "x".repeat(31))).toBe(
			m.profiles_error_name_long(),
		);
		expect(v.parse(profileName, "  Kid  ")).toBe("Kid");
	});

	it("wants a URL for an addon", () => {
		expect(message(addonUrl, "not a url")).toBe(
			m.settings_addons_invalid_url(),
		);
	});
});
