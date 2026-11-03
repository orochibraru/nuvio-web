import type { Database } from "bun:sqlite";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type {
	MailFailure,
	MailResult,
	PasswordChange,
	SmtpSettings,
	SmtpSettingsView,
} from "#lib/notifications/smtp.js";
import type { MailMessage, MailSender } from "#lib/notifications/types.js";
import { SecretBox } from "#lib/server/secret-box.js";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";

// The full service, for the admin page; everything else asks for MAILER.
export const MAILER_SERVICE = serviceToken<MailerService>("MailerService");

const SETTINGS_KEY = "smtp";
const PASSWORD_CONTEXT = "smtp.password";

interface StoredSmtp extends SmtpSettings {
	passwordEnc: string | null;
}

export type SmtpTransportFactory = (options: SMTPTransport.Options) => {
	sendMail: (mail: {
		from: string;
		to: string;
		subject: string;
		text: string;
	}) => Promise<unknown>;
};

const createSmtpTransport: SmtpTransportFactory = (options) =>
	nodemailer.createTransport(options);

function failureCode(error: unknown): MailFailure {
	const code = (error as { code?: string } | null)?.code;
	switch (code) {
		case "EAUTH":
		case "ENOAUTH":
			return "auth";
		case "ETIMEDOUT":
			return "timeout";
		case "ECONNECTION":
		case "ESOCKET":
		case "EDNS":
		case "ETLS":
			return "connection";
		case "EENVELOPE":
		case "EMESSAGE":
			return "rejected";
		default:
			return "unknown";
	}
}

// Singleton. Settings are read per send, so a change on the admin page applies at once.
export class MailerService implements MailSender {
	readonly #box: SecretBox;

	constructor(
		private readonly database: Pick<DatabaseService, "connect" | "tryConnect">,
		secret: string,
		private readonly logger: Pick<Logger, "warn">,
		private readonly createTransport: SmtpTransportFactory = createSmtpTransport,
	) {
		this.#box = new SecretBox(secret, "nuvio-web smtp password v1");
	}

	settings(): SmtpSettingsView | null {
		const stored = this.#read(this.database.connect());
		if (!stored) {
			return null;
		}
		const { passwordEnc, ...settings } = stored;
		return { ...settings, passwordSet: passwordEnc !== null };
	}

	save(settings: SmtpSettings, password: PasswordChange): void {
		const db = this.database.connect();
		const current = this.#read(db);
		let passwordEnc = current?.passwordEnc ?? null;
		if (password.action === "clear") {
			passwordEnc = null;
		} else if (password.action === "replace") {
			passwordEnc = this.#box.seal(PASSWORD_CONTEXT, password.password);
		}
		const stored: StoredSmtp = { ...settings, passwordEnc };
		db.query(
			`INSERT INTO settings (key, value) VALUES ($key, $value)
			 ON CONFLICT(key) DO UPDATE SET value = $value`,
		).run({ $key: SETTINGS_KEY, $value: JSON.stringify(stored) });
	}

	async send(message: MailMessage): Promise<boolean> {
		return (await this.deliver(message)).ok;
	}

	async deliver(message: MailMessage): Promise<MailResult> {
		let stored: StoredSmtp | null;
		let password: string | undefined;
		try {
			const db = this.database.tryConnect();
			stored = db ? this.#read(db) : null;
			password = stored?.passwordEnc
				? this.#box.open(PASSWORD_CONTEXT, stored.passwordEnc)
				: undefined;
		} catch {
			// A changed session secret leaves a password nobody can decrypt.
			return { ok: false, code: "not_configured" };
		}
		if (!stored) {
			return { ok: false, code: "not_configured" };
		}
		try {
			const transport = this.createTransport({
				host: stored.host,
				port: stored.port,
				secure: stored.security === "tls",
				requireTLS: stored.security === "starttls",
				ignoreTLS: stored.security === "none",
				auth: stored.username
					? { user: stored.username, pass: password }
					: undefined,
				connectionTimeout: 10_000,
				greetingTimeout: 10_000,
				socketTimeout: 20_000,
			});
			await transport.sendMail({
				from: stored.from,
				to: message.to,
				subject: message.subject,
				text: message.text,
			});
			return { ok: true };
		} catch (error) {
			const code = failureCode(error);
			this.logger.warn("Could not send mail", {
				code,
				host: stored.host,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			return { ok: false, code };
		}
	}

	#read(db: Database): StoredSmtp | null {
		const row = db
			.query<{ value: string }, [string]>(
				"SELECT value FROM settings WHERE key = ?",
			)
			.get(SETTINGS_KEY);
		return row ? (JSON.parse(row.value) as StoredSmtp) : null;
	}
}
