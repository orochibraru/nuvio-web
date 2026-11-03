import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "./database.service.ts";
import { MailerService, type SmtpTransportFactory } from "./mailer.service.ts";

const SECRET = "test-secret-test-secret-test-secret";
const SETTINGS = {
	host: "smtp.example.com",
	port: 587,
	security: "starttls" as const,
	username: "mailer",
	from: "nuvio@example.com",
};
const MESSAGE = { to: "admin@example.com", subject: "Hi", text: "Body" };

let db: Database;
let sendMail: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
let createTransport: ReturnType<typeof vi.fn<SmtpTransportFactory>>;
let logger: { warn: ReturnType<typeof vi.fn<(message: string) => void>> };

function mailer(secret = SECRET): MailerService {
	return new MailerService(
		{ connect: () => db, tryConnect: () => db },
		secret,
		logger,
		createTransport,
	);
}

function storedValue(): string {
	return (
		db.query("SELECT value FROM settings WHERE key = 'smtp'").get() as {
			value: string;
		}
	).value;
}

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	sendMail = vi.fn<() => Promise<unknown>>(async () => ({}));
	createTransport = vi.fn<SmtpTransportFactory>(() => ({ sendMail }));
	logger = { warn: vi.fn<(message: string) => void>() };
});

describe("MailerService", () => {
	it("reports not configured, and sends nothing, before any settings are saved", async () => {
		const service = mailer();
		expect(service.settings()).toBeNull();
		expect(await service.send(MESSAGE)).toBe(false);
		expect(await service.deliver(MESSAGE)).toEqual({
			ok: false,
			code: "not_configured",
		});
		expect(createTransport).not.toHaveBeenCalled();
	});

	it("sends through the saved server with its timeouts and credentials", async () => {
		const service = mailer();
		service.save(SETTINGS, { action: "replace", password: "hunter2" });

		expect(await service.send(MESSAGE)).toBe(true);
		expect(createTransport).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "smtp.example.com",
				port: 587,
				secure: false,
				requireTLS: true,
				ignoreTLS: false,
				auth: { user: "mailer", pass: "hunter2" },
				connectionTimeout: 10_000,
				greetingTimeout: 10_000,
				socketTimeout: 20_000,
			}),
		);
		expect(sendMail).toHaveBeenCalledWith({
			from: "nuvio@example.com",
			...MESSAGE,
		});
	});

	it("maps implicit TLS and no encryption onto the transport", async () => {
		const service = mailer();
		service.save(
			{ ...SETTINGS, security: "tls", username: "" },
			{ action: "keep" },
		);
		await service.send(MESSAGE);
		expect(createTransport).toHaveBeenLastCalledWith(
			expect.objectContaining({ secure: true, auth: undefined }),
		);
		service.save({ ...SETTINGS, security: "none" }, { action: "keep" });
		await service.send(MESSAGE);
		expect(createTransport).toHaveBeenLastCalledWith(
			expect.objectContaining({ secure: false, ignoreTLS: true }),
		);
	});

	it("returns false with a code instead of throwing when sending fails", async () => {
		const service = mailer();
		service.save(SETTINGS, { action: "keep" });
		sendMail.mockRejectedValueOnce(
			Object.assign(new Error("nope"), { code: "EAUTH" }),
		);
		expect(await service.deliver(MESSAGE)).toEqual({ ok: false, code: "auth" });
		sendMail.mockRejectedValueOnce(
			Object.assign(new Error("slow"), { code: "ETIMEDOUT" }),
		);
		expect(await service.send(MESSAGE)).toBe(false);
		sendMail.mockRejectedValueOnce(
			Object.assign(new Error("down"), { code: "ESOCKET" }),
		);
		expect(await service.deliver(MESSAGE)).toEqual({
			ok: false,
			code: "connection",
		});
		expect(logger.warn).toHaveBeenCalledTimes(3);
	});

	it("stores the password encrypted and never hands it back", () => {
		const service = mailer();
		service.save(SETTINGS, { action: "replace", password: "hunter2" });

		expect(storedValue()).not.toContain("hunter2");
		const view = service.settings();
		expect(view).toEqual({ ...SETTINGS, passwordSet: true });
		expect(JSON.stringify(view)).not.toContain("hunter2");
	});

	it("keeps the password on a save that leaves it empty, and clears it on request", async () => {
		const service = mailer();
		service.save(SETTINGS, { action: "replace", password: "hunter2" });
		service.save(
			{ ...SETTINGS, host: "smtp2.example.com" },
			{ action: "keep" },
		);
		await service.send(MESSAGE);
		expect(createTransport).toHaveBeenLastCalledWith(
			expect.objectContaining({
				host: "smtp2.example.com",
				auth: { user: "mailer", pass: "hunter2" },
			}),
		);

		service.save(SETTINGS, { action: "clear" });
		expect(service.settings()?.passwordSet).toBe(false);
	});

	it("treats a password sealed under another secret as not configured", async () => {
		mailer("another-secret-another-secret").save(SETTINGS, {
			action: "replace",
			password: "hunter2",
		});
		expect(await mailer().deliver(MESSAGE)).toEqual({
			ok: false,
			code: "not_configured",
		});
		expect(createTransport).not.toHaveBeenCalled();
	});
});
