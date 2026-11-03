import { error, invalid } from "@sveltejs/kit";
import * as v from "valibot";
import {
	backendFieldsSchema,
	backendPolicy,
	setBackendBanned,
	setCustomBackendsAllowed,
	setDefaultBackend,
	testBackend,
} from "#lib/admin/backends-data.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { m } from "#lib/i18n/index.js";
import { backendOrigin } from "#lib/nuvio/backend.js";
import { requireAdmin } from "#lib/server/guards.js";
import { DATABASE, LOGGER } from "#lib/services/index.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { command, form } from "$app/server";

// Every one of these re-checks `requireAdmin()`: a remote function is its own
// endpoint, reachable without the page.

function admin() {
	const { email, event } = requireAdmin();
	const services = event.locals.services;
	return { email, event, services, db: services.get(DATABASE).connect() };
}

/** Sessions on the old default end: its accounts are no longer this instance's. */
function changeDefault(
	{ email, services, db }: ReturnType<typeof admin>,
	next: { url: string; publishableKey: string } | null,
): void {
	const previous = backendPolicy(db).defaultBackend;
	setDefaultBackend(db, next);
	if (previous && previous.url !== next?.url) {
		services.get(SESSION_STORE).deleteAllForBackend(previous.url);
	}
	services.get(LOGGER).warn("Default backend changed", {
		by: email,
		backend: next ? backendOrigin(next.url) : "official",
	});
}

export const setCustomBackends = form(
	v.object({ allowed: v.picklist(["on", "off"]) }),
	(data) => {
		const { email, services, db } = admin();
		setCustomBackendsAllowed(db, data.allowed === "on");
		services
			.get(LOGGER)
			.warn(
				`Custom backends ${data.allowed === "on" ? "allowed" : "disallowed"}`,
				{
					by: email,
				},
			);
	},
);

/** An empty URL goes back to the official API. Sessions on the old default end. */
export const saveDefaultBackend = form(
	v.object({
		url: v.optional(v.pipe(v.string(), v.trim()), ""),
		publishableKey: v.optional(v.pipe(v.string(), v.trim()), ""),
	}),
	(data, issue) => {
		const context = admin();
		let next: { url: string; publishableKey: string } | null = null;
		if (data.url) {
			const parsed = v.safeParse(backendFieldsSchema, data);
			if (!parsed.success) {
				const field = v.flatten(parsed.issues).nested ?? {};
				invalid(
					...(field.url ? [issue.url(field.url[0])] : []),
					...(field.publishableKey
						? [issue.publishableKey(field.publishableKey[0])]
						: []),
				);
			}
			next = parsed.output;
		}
		changeDefault(context, next);
	},
);

/**
 * Makes this server's own backend the default. Only once the admin has an
 * account on it: the switch signs out every session on the old default.
 */
export const useBuiltInBackend = form(() => {
	const context = admin();
	const builtIn = context.services.get(BUILT_IN_BACKEND);
	const summary = builtIn.summary(context.event.url.origin, context.email);
	if (!summary.hasAccount) {
		invalid(m.admin_builtin_account_first());
	}
	changeDefault(context, {
		url: summary.url,
		publishableKey: summary.publishableKey,
	});
});

/** The admin's own account on the built-in backend: its API refuses admin emails. */
export const createBuiltInAccount = form(
	v.object({
		_password: v.pipe(
			v.string(),
			v.minLength(8, () => m.auth_error_password_short()),
			v.maxLength(1024),
		),
	}),
	async (data, issue) => {
		const { email, services } = admin();
		const created = await services
			.get(BUILT_IN_BACKEND)
			.createAccount(email, data._password);
		if (!created) {
			invalid(issue._password(m.auth_error_email_taken()));
		}
		services
			.get(LOGGER)
			.info("Built-in backend account created", { by: email });
	},
);

/** Tries the typed URL and key without saving them. */
export const testDefaultBackend = command(
	backendFieldsSchema,
	async (backend) => {
		admin();
		return { ok: await testBackend(backend) };
	},
);

const banSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
	banned: v.boolean(),
});

/** A ban refuses sign-in and ends every session on that backend, background sync included. */
export const setBackendBan = command(banSchema, ({ id, banned }) => {
	const { email, services, db } = admin();
	const url = setBackendBanned(db, id, { banned, by: email });
	if (url === null) {
		error(404, m.error_not_found());
	}
	if (banned) {
		services.get(SESSION_STORE).deleteAllForBackend(url);
	}
	services
		.get(LOGGER)
		.warn(`Custom backend ${banned ? "banned" : "unbanned"}`, {
			by: email,
			backend: backendOrigin(url),
		});
	return { ok: true };
});
