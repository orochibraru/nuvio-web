import { beforeEach, describe, expect, it, vi } from "vitest";

// `form(schema, fn)` → the bare handler; `invalid` throws a tagged object the
// tests can assert on.
class Invalid {
	constructor(public message: unknown) {}
}

vi.mock("@sveltejs/kit", () => ({
	invalid: (message: unknown) => {
		throw new Invalid(message);
	},
}));

const { data, logger, event, admin } = vi.hoisted(() => {
	const data = {
		setLocked: vi.fn(),
		addToAllowlist: vi.fn(),
		removeFromAllowlist: vi.fn(),
	};
	const logger = { warn: vi.fn() };
	const db = { marker: "db" };
	const admin = { email: "boss@example.com" };
	return {
		data,
		logger,
		admin,
		db,
		event: {
			locals: {
				services: {
					get: (token: { name?: string }) =>
						String(token) === "LOGGER" ? logger : { connect: () => db },
				},
			},
		},
	};
});

vi.mock("$app/server", () => ({
	form: (_schema: unknown, fn: unknown) => fn,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireAdmin: () => ({ event, email: admin.email }),
}));

vi.mock("#lib/admin/admin-data.js", () => ({
	setLocked: (...args: unknown[]) => data.setLocked(...args),
	addToAllowlist: (...args: unknown[]) => data.addToAllowlist(...args),
	removeFromAllowlist: (...args: unknown[]) =>
		data.removeFromAllowlist(...args),
}));

vi.mock("#lib/services/index.js", () => ({
	DATABASE: { toString: () => "DATABASE" },
	LOGGER: { toString: () => "LOGGER" },
}));

import * as adminForms from "./admin.remote.ts";

// The `form(...)` results aren't callable in their public type; the tests drive
// the underlying handler directly, as `auth.remote.test.ts` does.
type FormHandler = (data: Record<string, unknown>) => unknown;
const setInstanceLock = adminForms.setInstanceLock as unknown as FormHandler;
const allowEmail = adminForms.allowEmail as unknown as FormHandler;
const revokeEmail = adminForms.revokeEmail as unknown as FormHandler;

beforeEach(() => {
	vi.clearAllMocks();
	admin.email = "boss@example.com";
});

describe("setInstanceLock", () => {
	it("locks the instance and logs who did it", async () => {
		await setInstanceLock({ locked: "on" });
		expect(data.setLocked).toHaveBeenCalledWith({ marker: "db" }, true);
		expect(logger.warn).toHaveBeenCalledWith("Instance locked", {
			by: "boss@example.com",
		});
	});

	it("unlocks on 'off'", async () => {
		await setInstanceLock({ locked: "off" });
		expect(data.setLocked).toHaveBeenCalledWith({ marker: "db" }, false);
		expect(logger.warn).toHaveBeenCalledWith("Instance unlocked", {
			by: "boss@example.com",
		});
	});
});

describe("allowEmail", () => {
	it("records who added the address", async () => {
		await allowEmail({ email: "new@example.com" });
		expect(data.addToAllowlist).toHaveBeenCalledWith(
			{ marker: "db" },
			"new@example.com",
			"boss@example.com",
		);
	});
});

describe("revokeEmail", () => {
	it("removes another address", async () => {
		await revokeEmail({ email: "other@example.com" });
		expect(data.removeFromAllowlist).toHaveBeenCalledWith(
			{ marker: "db" },
			"other@example.com",
		);
	});

	it("refuses to remove the signed-in admin, whatever the casing", async () => {
		// The handler is synchronous, so it throws rather than rejecting.
		expect(() => revokeEmail({ email: "  BOSS@example.com " })).toThrow(
			Invalid,
		);
		expect(data.removeFromAllowlist).not.toHaveBeenCalled();
	});
});
