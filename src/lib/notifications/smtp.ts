import * as v from "valibot";
import { m } from "#lib/i18n/index.js";

export const SMTP_SECURITY = ["none", "starttls", "tls"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];

export interface SmtpSettings {
	host: string;
	port: number;
	security: SmtpSecurity;
	username: string;
	from: string;
}

export interface SmtpSettingsView extends SmtpSettings {
	passwordSet: boolean;
}

export type PasswordChange =
	| { action: "keep" }
	| { action: "replace"; password: string }
	| { action: "clear" };

export const MAIL_FAILURES = [
	"not_configured",
	"auth",
	"connection",
	"timeout",
	"rejected",
	"unknown",
] as const;
export type MailFailure = (typeof MAIL_FAILURES)[number];
export type MailResult = { ok: true } | { ok: false; code: MailFailure };

const HOSTNAME =
	/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export const smtpSettingsSchema = v.object({
	host: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(() => m.admin_smtp_error_host()),
		v.regex(HOSTNAME, () => m.admin_smtp_error_host()),
	),
	port: v.pipe(
		v.number(() => m.admin_smtp_error_port()),
		v.integer(() => m.admin_smtp_error_port()),
		v.minValue(1, () => m.admin_smtp_error_port()),
		v.maxValue(65_535, () => m.admin_smtp_error_port()),
	),
	security: v.picklist(SMTP_SECURITY),
	username: v.pipe(v.optional(v.string(), ""), v.trim(), v.maxLength(256)),
	_password: v.pipe(v.optional(v.string(), ""), v.maxLength(1024)),
	clearPassword: v.optional(v.boolean(), false),
	from: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(() => m.admin_smtp_error_from()),
		v.email(() => m.admin_smtp_error_from()),
		v.maxLength(254),
	),
});

export type SmtpSettingsInput = v.InferOutput<typeof smtpSettingsSchema>;

export function passwordChange(input: SmtpSettingsInput): PasswordChange {
	if (input.clearPassword) {
		return { action: "clear" };
	}
	return input._password === ""
		? { action: "keep" }
		: { action: "replace", password: input._password };
}
