import { Database } from "bun:sqlite";
import { setDefaultBackend } from "#lib/admin/backends-data.js";
import type { MailMessage } from "#lib/notifications/types.js";
import { NuvioClient } from "#lib/nuvio/client.js";
import { AdminService } from "#lib/services/admin.service.js";
import { DatabaseService } from "#lib/services/database.service.js";
import { Logger } from "#lib/services/logger.service.js";
import { RateLimiter } from "#lib/services/rate-limit.service.js";
import { BuiltInBackend } from "./handler.ts";

export const BASE_URL = "https://nuvio.example/api/nuvio";
export const ADMIN_EMAIL = "admin@example.com";
export const SECRET = "test-session-secret";

/**
 * A built-in backend over an in-memory database, with a clock the test moves
 * and a mailer that keeps what it sends (`mail.configured` false: no SMTP).
 */
export function testBackend(
	db = DatabaseService.migrate(new Database(":memory:")),
) {
	const clock = { at: Date.parse("2026-11-01T12:00:00Z") };
	const now = () => clock.at;
	const mail: { configured: boolean; sent: MailMessage[] } = {
		configured: true,
		sent: [],
	};
	const backend = new BuiltInBackend(
		{ connect: () => db },
		SECRET,
		{
			limiter: new RateLimiter(now),
			admin: new AdminService(ADMIN_EMAIL),
			logger: new Logger("error", {
				out: () => undefined,
				err: () => undefined,
			}),
			mailer: {
				settings: () => (mail.configured ? ({} as never) : null),
				send: (message) => {
					mail.sent.push(message);
					return Promise.resolve(true);
				},
			},
			pages: {
				resetPassword: "/auth/reset-password",
				confirmEmail: "/auth/confirm-email",
			},
		},
		now,
	);
	/** Makes it the instance default, which emailed links need for their origin. */
	const makeDefault = () =>
		setDefaultBackend(db, {
			url: BASE_URL,
			publishableKey: backend.publishableKey(),
		});
	/** The token of the last link emailed to `to`. */
	const linkToken = (to: string) => {
		const message = mail.sent.findLast((sent) => sent.to === to);
		return message
			? (/[?&]token=([\w-]+)/.exec(message.text)?.[1] ?? null)
			: null;
	};
	const client = () =>
		new NuvioClient({
			baseUrl: BASE_URL,
			publishableKey: backend.publishableKey(),
			fetch: backend.fetch,
		});
	const request = (
		path: string,
		init: RequestInit = {},
		address: string | null = null,
	) => backend.handle(new Request(`${BASE_URL}/${path}`, init), address);
	return {
		db,
		clock,
		backend,
		client,
		request,
		mail,
		makeDefault,
		linkToken,
	};
}
