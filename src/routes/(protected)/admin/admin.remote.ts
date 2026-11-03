import { invalid } from "@sveltejs/kit";
import * as v from "valibot";
import {
	addToAllowlist,
	removeFromAllowlist,
	setLocked,
} from "#lib/admin/admin-data.js";
import { m } from "#lib/i18n/index.js";
import { passwordChange, smtpSettingsSchema } from "#lib/notifications/smtp.js";
import { requireAdmin } from "#lib/server/guards.js";
import { ADMIN_NOTIFICATIONS } from "#lib/services/admin-notifier.service.js";
import { DATABASE, LOGGER } from "#lib/services/index.js";
import { MAILER_SERVICE } from "#lib/services/mailer.service.js";
import { form } from "$app/server";

// Every one of these re-checks `requireAdmin()`. The page guard only protects
// the page: a remote function is its own endpoint and is reachable directly.

export const setInstanceLock = form(
	v.object({ locked: v.picklist(["on", "off"]) }),
	(data) => {
		const { email, event } = requireAdmin();
		const services = event.locals.services;
		const locked = data.locked === "on";
		setLocked(services.get(DATABASE).connect(), locked);
		services
			.get(LOGGER)
			.warn(`Instance ${locked ? "locked" : "unlocked"}`, { by: email });
	},
);

export const allowEmail = form(
	v.object({
		email: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty(() => m.admin_error_email_required()),
			v.email(() => m.common_email_invalid()),
		),
	}),
	(data) => {
		const { email, event } = requireAdmin();
		addToAllowlist(
			event.locals.services.get(DATABASE).connect(),
			data.email,
			email,
		);
	},
);

export const revokeEmail = form(
	v.object({ email: v.pipe(v.string(), v.nonEmpty()) }),
	(data) => {
		const { email, event } = requireAdmin();
		if (data.email.trim().toLowerCase() === email.toLowerCase()) {
			invalid(m.admin_error_remove_self());
		}
		removeFromAllowlist(
			event.locals.services.get(DATABASE).connect(),
			data.email,
		);
	},
);

export const saveSmtpSettings = form(smtpSettingsSchema, (data) => {
	const { email, event } = requireAdmin();
	const services = event.locals.services;
	services.get(MAILER_SERVICE).save(
		{
			host: data.host,
			port: data.port,
			security: data.security,
			username: data.username,
			from: data.from,
		},
		passwordChange(data),
	);
	services.get(LOGGER).warn("SMTP settings changed", { by: email });
});

export const sendTestEmail = form(v.object({}), async () => {
	const { email, event } = requireAdmin();
	return await event.locals.services.get(MAILER_SERVICE).deliver({
		to: email,
		subject: "Nuvio: test email",
		text: "This is a test email from your Nuvio server. SMTP works.",
	});
});

export const markNotificationRead = form(
	v.object({ id: v.pipe(v.string(), v.toNumber(), v.integer()) }),
	(data) => {
		const { email, event } = requireAdmin();
		event.locals.services.get(ADMIN_NOTIFICATIONS).markRead(email, data.id);
	},
);

export const markAllNotificationsRead = form(v.object({}), () => {
	const { email, event } = requireAdmin();
	event.locals.services.get(ADMIN_NOTIFICATIONS).markAllRead(email);
});

export const setNotificationEmail = form(
	v.object({ enabled: v.picklist(["on", "off"]) }),
	(data) => {
		const { email, event } = requireAdmin();
		event.locals.services
			.get(ADMIN_NOTIFICATIONS)
			.setEmailEnabled(email, data.enabled === "on");
	},
);
