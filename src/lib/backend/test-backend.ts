import { Database } from "bun:sqlite";
import { NuvioClient } from "#lib/nuvio/client.js";
import { AdminService } from "#lib/services/admin.service.js";
import { DatabaseService } from "#lib/services/database.service.js";
import { Logger } from "#lib/services/logger.service.js";
import { RateLimiter } from "#lib/services/rate-limit.service.js";
import { BuiltInBackend } from "./handler.ts";

export const BASE_URL = "https://nuvio.example/api/nuvio";
export const ADMIN_EMAIL = "admin@example.com";
export const SECRET = "test-session-secret";

/** A built-in backend over an in-memory database, with a clock the test moves. */
export function testBackend() {
	const db = DatabaseService.migrate(new Database(":memory:"));
	const clock = { at: Date.parse("2026-11-01T12:00:00Z") };
	const now = () => clock.at;
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
		},
		now,
	);
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
	return { db, clock, backend, client, request };
}
