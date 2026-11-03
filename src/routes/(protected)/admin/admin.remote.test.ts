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

const { data, logger, admin, mailer, notifier, guard } = vi.hoisted(() => {
	const data = {
		setLocked: vi.fn(),
		addToAllowlist: vi.fn(),
		removeFromAllowlist: vi.fn(),
	};
	const logger = { warn: vi.fn() };
	const mailer = {
		save: vi.fn(),
		deliver: vi.fn(async () => ({ ok: true })),
	};
	const notifier = {
		markRead: vi.fn(),
		markAllRead: vi.fn(),
		setEmailEnabled: vi.fn(),
	};
	const db = { marker: "db" };
	const admin = { email: "boss@example.com" };
	const services: Record<string, unknown> = {
		LOGGER: logger,
		MAILER_SERVICE: mailer,
		ADMIN_NOTIFICATIONS: notifier,
	};
	const event = {
		locals: {
			services: {
				get: (token: { name?: string }) =>
					services[String(token)] ?? { connect: () => db },
			},
		},
	};
	const guard = vi.fn(() => ({ event, email: admin.email }));
	return { data, logger, admin, db, mailer, notifier, event, guard };
});

vi.mock("$app/server", () => ({
	form: (_schema: unknown, fn: unknown) => fn,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireAdmin: () => guard(),
}));

vi.mock("#lib/services/mailer.service.js", () => ({
	MAILER_SERVICE: { toString: () => "MAILER_SERVICE" },
}));

vi.mock("#lib/services/admin-notifier.service.js", () => ({
	ADMIN_NOTIFICATIONS: { toString: () => "ADMIN_NOTIFICATIONS" },
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
const saveSmtpSettings = adminForms.saveSmtpSettings as unknown as FormHandler;
const sendTestEmail = adminForms.sendTestEmail as unknown as FormHandler;
const markNotificationRead =
	adminForms.markNotificationRead as unknown as FormHandler;
const markAllNotificationsRead =
	adminForms.markAllNotificationsRead as unknown as FormHandler;
const setNotificationEmail =
	adminForms.setNotificationEmail as unknown as FormHandler;

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

const SMTP_INPUT = {
	host: "smtp.example.com",
	port: 587,
	security: "starttls",
	username: "mailer",
	_password: "",
	clearPassword: false,
	from: "nuvio@example.com",
};

describe("SMTP settings", () => {
	it("saves the settings and keeps the password when the field is empty", async () => {
		await saveSmtpSettings(SMTP_INPUT);
		expect(mailer.save).toHaveBeenCalledWith(
			{
				host: "smtp.example.com",
				port: 587,
				security: "starttls",
				username: "mailer",
				from: "nuvio@example.com",
			},
			{ action: "keep" },
		);
	});

	it("replaces or clears the password on request", async () => {
		await saveSmtpSettings({ ...SMTP_INPUT, _password: "hunter2" });
		expect(mailer.save).toHaveBeenLastCalledWith(expect.anything(), {
			action: "replace",
			password: "hunter2",
		});
		await saveSmtpSettings({ ...SMTP_INPUT, clearPassword: true });
		expect(mailer.save).toHaveBeenLastCalledWith(expect.anything(), {
			action: "clear",
		});
	});

	it("sends the test email to the acting admin and returns the result", async () => {
		expect(await sendTestEmail({})).toEqual({ ok: true });
		expect(mailer.deliver).toHaveBeenCalledWith(
			expect.objectContaining({ to: "boss@example.com" }),
		);
	});
});

describe("notifications", () => {
	it("marks one or all read for the acting admin", async () => {
		await markNotificationRead({ id: 3 });
		expect(notifier.markRead).toHaveBeenCalledWith("boss@example.com", 3);
		await markAllNotificationsRead({});
		expect(notifier.markAllRead).toHaveBeenCalledWith("boss@example.com");
	});

	it("stores the acting admin's email preference", async () => {
		await setNotificationEmail({ enabled: "on" });
		expect(notifier.setEmailEnabled).toHaveBeenCalledWith(
			"boss@example.com",
			true,
		);
	});
});

describe("requireAdmin", () => {
	const calls: Array<[string, () => unknown]> = [
		["setInstanceLock", () => setInstanceLock({ locked: "on" })],
		["allowEmail", () => allowEmail({ email: "a@example.com" })],
		["revokeEmail", () => revokeEmail({ email: "a@example.com" })],
		["saveSmtpSettings", () => saveSmtpSettings(SMTP_INPUT)],
		["sendTestEmail", () => sendTestEmail({})],
		["markNotificationRead", () => markNotificationRead({ id: 1 })],
		["markAllNotificationsRead", () => markAllNotificationsRead({})],
		["setNotificationEmail", () => setNotificationEmail({ enabled: "on" })],
	];

	it.each(calls)(
		"%s refuses a non-admin before doing anything",
		async (_name, call) => {
			guard.mockImplementationOnce(() => {
				throw new Error("404");
			});
			await expect(async () => call()).rejects.toThrow("404");
			expect(data.setLocked).not.toHaveBeenCalled();
			expect(data.addToAllowlist).not.toHaveBeenCalled();
			expect(data.removeFromAllowlist).not.toHaveBeenCalled();
			expect(mailer.save).not.toHaveBeenCalled();
			expect(mailer.deliver).not.toHaveBeenCalled();
			expect(notifier.markRead).not.toHaveBeenCalled();
			expect(notifier.markAllRead).not.toHaveBeenCalled();
			expect(notifier.setEmailEnabled).not.toHaveBeenCalled();
		},
	);
});
