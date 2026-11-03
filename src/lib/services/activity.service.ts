import { recordActive } from "#lib/admin/admin-data.js";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";

export const ACTIVITY = serviceToken<ActivityTracker>("ActivityTracker");

const MS_PER_DAY = 86_400_000;

// Singleton: the in-memory set keeps it to one write per account per day.
export class ActivityTracker {
	#day = -1;
	readonly #seen = new Set<string>();

	constructor(
		private readonly database: Pick<DatabaseService, "tryConnect">,
		private readonly logger: Pick<Logger, "error">,
		private readonly now: () => number = Date.now,
	) {}

	seen(email: string): void {
		const now = this.now();
		const day = Math.floor(now / MS_PER_DAY);
		if (day !== this.#day) {
			this.#day = day;
			this.#seen.clear();
		}
		const key = email.trim().toLowerCase();
		if (this.#seen.has(key)) {
			return;
		}
		const db = this.database.tryConnect();
		if (!db) {
			return;
		}
		this.#seen.add(key);
		try {
			recordActive(db, key, now);
		} catch (error) {
			this.logger.error("Could not record activity", {
				error: error instanceof Error ? error : "Unknown error",
			});
		}
	}
}
