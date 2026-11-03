import { isLocked, listAllowlist } from "#lib/admin/admin-data.js";
import { pullBackendRequests } from "#lib/admin/backends-data.js";
import {
	activePerDay,
	newAccountsPerDay,
	playsPerDay,
	signInsPerDay,
	statsOverview,
	topTitles,
	weeklyNewAndReturning,
} from "#lib/admin/stats-data.js";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { requireAdmin } from "#lib/server/guards.js";
import { ADMIN_NOTIFICATIONS } from "#lib/services/admin-notifier.service.js";
import { ADMIN, DATABASE, LOGGER } from "#lib/services/index.js";
import type { Logger } from "#lib/services/logger.service.js";
import { MAILER_SERVICE } from "#lib/services/mailer.service.js";
import type { PageServerLoad } from "./$types";

function deferred<T>(
	logger: Logger,
	block: string,
	compute: () => T | Promise<T>,
	fallback: T,
): Promise<T> {
	return Promise.resolve()
		.then(compute)
		.catch((cause: unknown) => {
			logger.error("Admin block failed", { block, error: cause });
			return fallback;
		});
}

export const load: PageServerLoad = () => {
	const { event, email } = requireAdmin();
	const services = event.locals.services;
	const db = services.get(DATABASE).connect();
	const notifications = services.get(ADMIN_NOTIFICATIONS);
	const logger = services.get(LOGGER).scoped("Admin");
	return {
		locked: isLocked(db),
		allowlist: listAllowlist(db),
		admins: [...services.get(ADMIN).emails],
		overview: deferred(logger, "overview", () => statsOverview(db), null),
		activeDays: deferred(logger, "activeDays", () => activePerDay(db), []),
		signInDays: deferred(logger, "signInDays", () => signInsPerDay(db), []),
		newAccountDays: deferred(
			logger,
			"newAccountDays",
			() => newAccountsPerDay(db),
			[],
		),
		playDays: deferred(logger, "playDays", () => playsPerDay(db), []),
		weeks: deferred(logger, "weeks", () => weeklyNewAndReturning(db), []),
		topTitles: deferred(logger, "topTitles", () => topTitles(db), []),
		notifications: deferred(
			logger,
			"notifications",
			() => ({
				items: notifications.list(email),
				emailEnabled: notifications.emailEnabled(email),
			}),
			{ items: [], emailEnabled: false },
		),
		smtp: deferred(
			logger,
			"smtp",
			() => services.get(MAILER_SERVICE).settings(),
			null,
		),
		builtIn: deferred(
			logger,
			"builtIn",
			() => services.get(BUILT_IN_BACKEND).summary(event.url.origin, email),
			null,
		),
		backends: deferred(logger, "backends", () => pullBackendRequests(db), {
			customAllowed: false,
			defaultUrl: "",
			defaultKey: "",
			seen: [],
		}),
	};
};
