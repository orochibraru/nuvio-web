import { error, invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { m } from "#lib/i18n/index.js";
import { NuvioApiError } from "#lib/nuvio/index.js";
import { LOGGER, SESSION } from "#lib/services/index.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { USER_DATA_STORE } from "#lib/userdata/tokens.js";
import { resolve } from "$app/paths";
import { form, getRequestEvent } from "$app/server";

/** The built-in backend's accounts only: the official API has no self-service deletion. */
export const deleteAccount = form(
	v.object({
		_password: v.pipe(
			v.string(),
			v.nonEmpty(() => m.auth_error_password_required()),
			v.maxLength(1024),
		),
	}),
	async (data, issue) => {
		const { locals } = getRequestEvent();
		const services = locals.services;
		if (
			!(locals.session && services.get(BUILT_IN_BACKEND).ownsSession(locals))
		) {
			error(404, m.error_not_found());
		}
		const { accountKey } = locals.session;
		try {
			await locals.nuvio.deleteAccount(data._password);
		} catch (cause) {
			if (!(cause instanceof NuvioApiError)) {
				throw cause;
			}
			if (cause.status === 429) {
				invalid(m.auth_error_rate_limited());
			}
			if (cause.code === "invalid_credentials") {
				invalid(issue._password(m.account_delete_wrong_password()));
			}
			invalid(m.error_default());
		}
		// This server's mirror of the account, and every browser signed in to it.
		services.get(USER_DATA_STORE).deleteUser(accountKey);
		services.get(SESSION_STORE).deleteAllForUser(accountKey);
		services.get(SESSION).clear();
		services.get(LOGGER).info("Built-in backend account deleted", {
			account: accountKey,
		});
		redirect(303, resolve("auth/sign-in"));
	},
);
