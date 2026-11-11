import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseService } from "#lib/services/database.service.js";

export type Entity = "library" | "progress" | "watched";
export type BlobKind = "settings" | "home_catalog" | "collections";

const TABLES: Record<Entity, { items: string; events: string }> = {
	library: { items: "backend_library", events: "backend_library_events" },
	progress: {
		items: "backend_watch_progress",
		events: "backend_watch_progress_events",
	},
	watched: {
		items: "backend_watched_items",
		events: "backend_watched_items_events",
	},
};

function itemTables({ items, events }: { items: string; events: string }) {
	return `
CREATE TABLE IF NOT EXISTS ${items} (
	user_id     TEXT NOT NULL,
	profile_id  INTEGER NOT NULL,
	item_key    TEXT NOT NULL,
	id          TEXT NOT NULL,
	data        TEXT NOT NULL,
	sort_at     INTEGER NOT NULL,
	created_at  INTEGER NOT NULL,
	updated_at  INTEGER NOT NULL,
	PRIMARY KEY (user_id, profile_id, item_key)
);
CREATE INDEX IF NOT EXISTS ${items}_sort ON ${items} (user_id, profile_id, sort_at);
CREATE TABLE IF NOT EXISTS ${events} (
	event_id          INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id           TEXT NOT NULL,
	profile_id        INTEGER NOT NULL,
	item_key          TEXT NOT NULL,
	operation         TEXT NOT NULL,
	data              TEXT NOT NULL,
	origin_client_id  TEXT,
	created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ${events}_cursor ON ${events} (user_id, profile_id, event_id);
CREATE INDEX IF NOT EXISTS ${events}_key ON ${events} (user_id, profile_id, item_key);
`;
}

// Times are unix ms. A change appends an event with a fresh AUTOINCREMENT id
// and drops that item's older events, so the log holds one row per item.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS backend_profiles (
	user_id              TEXT NOT NULL,
	profile_index        INTEGER NOT NULL,
	id                   TEXT NOT NULL,
	name                 TEXT NOT NULL,
	avatar_color_hex     TEXT NOT NULL,
	uses_primary_addons  INTEGER NOT NULL,
	avatar_id            TEXT,
	avatar_url           TEXT,
	created_at           INTEGER NOT NULL,
	updated_at           INTEGER NOT NULL,
	PRIMARY KEY (user_id, profile_index)
);
CREATE TABLE IF NOT EXISTS backend_addons (
	user_id     TEXT NOT NULL,
	profile_id  INTEGER NOT NULL,
	url_hash    TEXT NOT NULL,
	id          TEXT NOT NULL,
	url         TEXT NOT NULL,
	name        TEXT,
	enabled     INTEGER NOT NULL,
	sort_order  INTEGER NOT NULL,
	created_at  INTEGER NOT NULL,
	updated_at  INTEGER NOT NULL,
	PRIMARY KEY (user_id, profile_id, url_hash)
);
CREATE TABLE IF NOT EXISTS backend_blobs (
	kind        TEXT NOT NULL,
	user_id     TEXT NOT NULL,
	profile_id  INTEGER NOT NULL,
	platform    TEXT NOT NULL,
	id          TEXT NOT NULL,
	json        TEXT NOT NULL,
	updated_at  INTEGER NOT NULL,
	PRIMARY KEY (kind, user_id, profile_id, platform)
);
${Object.values(TABLES).map(itemTables).join("")}`;

const DEFAULT_COLOR = "#1E88E5";

/** Whose data, and which profile slot. */
export interface Scope {
	userId: string;
	profileId: number;
}

export interface ProfileInput {
	profile_index: number;
	name: string;
	avatar_color_hex?: string | null;
	uses_primary_addons?: boolean | null;
	avatar_id?: string | null;
	avatar_url?: string | null;
}

export interface AddonInput {
	url: string;
	name: string | null;
	enabled: boolean;
	sort_order: number;
}

export interface ItemInput {
	key: string;
	data: Record<string, unknown>;
	sortAt: number;
}

interface ProfileRow {
	user_id: string;
	profile_index: number;
	id: string;
	name: string;
	avatar_color_hex: string;
	uses_primary_addons: number;
	avatar_id: string | null;
	avatar_url: string | null;
	created_at: number;
	updated_at: number;
}

interface AddonRow {
	user_id: string;
	profile_id: number;
	url_hash: string;
	id: string;
	url: string;
	name: string | null;
	enabled: number;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

interface ItemRow {
	user_id: string;
	profile_id: number;
	id: string;
	data: string;
	created_at: number;
	updated_at: number;
}

interface EventInput {
	key: string;
	operation: "upsert" | "delete";
	data: string;
	origin: string | null;
}

export function isoTime(ms: number): string {
	return new Date(ms).toISOString();
}

function profileView(row: ProfileRow) {
	return {
		id: row.id,
		user_id: row.user_id,
		profile_index: row.profile_index,
		name: row.name,
		avatar_color_hex: row.avatar_color_hex,
		uses_primary_addons: row.uses_primary_addons === 1,
		avatar_id: row.avatar_id,
		avatar_url: row.avatar_url,
		pin_enabled: false,
		pin_locked_until: null,
		created_at: isoTime(row.created_at),
		updated_at: isoTime(row.updated_at),
	};
}

function addonView(row: AddonRow) {
	return {
		id: row.id,
		user_id: row.user_id,
		profile_id: row.profile_id,
		url: row.url,
		name: row.name,
		enabled: row.enabled === 1,
		sort_order: row.sort_order,
		created_at: isoTime(row.created_at),
		updated_at: isoTime(row.updated_at),
	};
}

/** `avatar_url`, when sent, wins and clears an unsent `avatar_id`; otherwise both are kept. */
function avatarOf(input: ProfileInput, current: ProfileRow | undefined) {
	if ("avatar_url" in input) {
		return { id: input.avatar_id ?? null, url: input.avatar_url || null };
	}
	return {
		id: input.avatar_id ?? current?.avatar_id ?? null,
		url: current?.avatar_url ?? null,
	};
}

function sameAddon(row: AddonRow | undefined, input: AddonInput): boolean {
	return (
		row !== undefined &&
		row.name === input.name &&
		row.enabled === (input.enabled ? 1 : 0) &&
		row.sort_order === input.sort_order
	);
}

/**
 * The built-in backend's data tables, separate from the app's `userdata_*` on
 * purpose: the app mirrors to this backend the way it mirrors to Nuvio's.
 * Every value is a bound parameter; table names are the constants above.
 */
export class BackendStore {
	#migrated: Database | null = null;

	constructor(
		private readonly database: Pick<DatabaseService, "connect">,
		private readonly now: () => number = Date.now,
	) {}

	db(): Database {
		const db = this.database.connect();
		if (this.#migrated !== db) {
			db.run(SCHEMA);
			this.#migrated = db;
		}
		return db;
	}

	// Profiles

	profiles(userId: string) {
		return this.db()
			.query<ProfileRow, [string]>(
				"SELECT * FROM backend_profiles WHERE user_id = ? ORDER BY profile_index",
			)
			.all(userId)
			.map(profileView);
	}

	#writeProfile(
		userId: string,
		input: ProfileInput,
		current: ProfileRow | undefined,
	): void {
		const avatar = avatarOf(input, current);
		const now = this.now();
		this.db()
			.query(
				`INSERT INTO backend_profiles (user_id, profile_index, id, name,
					avatar_color_hex, uses_primary_addons, avatar_id, avatar_url,
					created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(user_id, profile_index) DO UPDATE SET
					name = excluded.name,
					avatar_color_hex = excluded.avatar_color_hex,
					uses_primary_addons = excluded.uses_primary_addons,
					avatar_id = excluded.avatar_id,
					avatar_url = excluded.avatar_url,
					updated_at = excluded.updated_at`,
			)
			.run(
				userId,
				input.profile_index,
				current?.id ?? randomUUID(),
				input.name,
				input.avatar_color_hex ?? current?.avatar_color_hex ?? DEFAULT_COLOR,
				(input.uses_primary_addons ?? current?.uses_primary_addons === 1)
					? 1
					: 0,
				avatar.id,
				avatar.url,
				now,
				now,
			);
	}

	/** Full replace of slots `1..maxIndex`: a slot missing from `inputs` is deleted. */
	replaceProfiles(
		userId: string,
		inputs: ProfileInput[],
		maxIndex: number,
	): void {
		const db = this.db();
		db.transaction(() => {
			const existing = new Map(
				db
					.query<ProfileRow, [string]>(
						"SELECT * FROM backend_profiles WHERE user_id = ?",
					)
					.all(userId)
					.map((row) => [row.profile_index, row]),
			);
			const kept = new Set(inputs.map((input) => input.profile_index));
			for (const index of existing.keys()) {
				if (index <= maxIndex && !kept.has(index)) {
					db.query(
						"DELETE FROM backend_profiles WHERE user_id = ? AND profile_index = ?",
					).run(userId, index);
				}
			}
			for (const input of inputs) {
				this.#writeProfile(userId, input, existing.get(input.profile_index));
			}
		})();
	}

	deleteProfileData(scope: Scope): void {
		const db = this.db();
		db.transaction(() => {
			for (const entity of Object.keys(TABLES) as Entity[]) {
				const keys = db
					.query<{ item_key: string }, [string, number]>(
						`SELECT item_key FROM ${TABLES[entity].items} WHERE user_id = ? AND profile_id = ?`,
					)
					.all(scope.userId, scope.profileId)
					.map((row) => row.item_key);
				this.deleteItems(entity, scope, keys, null);
			}
			for (const table of ["backend_addons", "backend_blobs"]) {
				db.query(
					`DELETE FROM ${table} WHERE user_id = ? AND profile_id = ?`,
				).run(scope.userId, scope.profileId);
			}
			db.query(
				"DELETE FROM backend_profiles WHERE user_id = ? AND profile_index = ?",
			).run(scope.userId, scope.profileId);
		})();
	}

	/** Everything the user stored, every profile. */
	deleteUserData(userId: string): void {
		const db = this.db();
		const tables = [
			"backend_profiles",
			"backend_addons",
			"backend_blobs",
			...Object.values(TABLES).flatMap(({ items, events }) => [items, events]),
		];
		db.transaction(() => {
			for (const table of tables) {
				db.query(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
			}
		})();
	}

	// Addons

	addons(userId: string, profileId: number | null) {
		return this.db()
			.query<AddonRow, [string, number | null, number | null]>(
				`SELECT * FROM backend_addons WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
				 ORDER BY sort_order, created_at, url`,
			)
			.all(userId, profileId, profileId)
			.map(addonView);
	}

	/** Keyed by md5(url); a row is written only when something about it changed. */
	replaceAddons(scope: Scope, inputs: AddonInput[]): void {
		const db = this.db();
		const now = this.now();
		db.transaction(() => {
			const existing = new Map(
				db
					.query<AddonRow, [string, number]>(
						"SELECT * FROM backend_addons WHERE user_id = ? AND profile_id = ?",
					)
					.all(scope.userId, scope.profileId)
					.map((row) => [row.url_hash, row]),
			);
			const wanted = new Map(
				inputs.map((input) => [
					createHash("md5").update(input.url).digest("hex"),
					input,
				]),
			);
			for (const hash of existing.keys()) {
				if (!wanted.has(hash)) {
					db.query(
						"DELETE FROM backend_addons WHERE user_id = ? AND profile_id = ? AND url_hash = ?",
					).run(scope.userId, scope.profileId, hash);
				}
			}
			for (const [hash, input] of wanted) {
				const current = existing.get(hash);
				if (sameAddon(current, input)) {
					continue;
				}
				db.query(
					`INSERT INTO backend_addons (user_id, profile_id, url_hash, id, url, name,
						enabled, sort_order, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(user_id, profile_id, url_hash) DO UPDATE SET
						name = excluded.name,
						enabled = excluded.enabled,
						sort_order = excluded.sort_order,
						updated_at = excluded.updated_at`,
				).run(
					scope.userId,
					scope.profileId,
					hash,
					current?.id ?? randomUUID(),
					input.url,
					input.name,
					input.enabled ? 1 : 0,
					input.sort_order,
					now,
					now,
				);
			}
		})();
	}

	// Library, watch progress, watched items

	/** Newest first; with `since`, only what is newer, oldest first so it pages as a cursor. */
	items(
		entity: Entity,
		scope: Scope,
		page: { limit: number; offset: number; since?: number | null },
	) {
		const since = page.since ?? null;
		return this.db()
			.query<
				ItemRow,
				[string, number, number | null, number | null, number, number]
			>(
				`SELECT * FROM ${TABLES[entity].items}
				 WHERE user_id = ? AND profile_id = ? AND (? IS NULL OR sort_at > ?)
				 ORDER BY ${since === null ? "sort_at DESC" : "sort_at ASC"}, item_key
				 LIMIT ? OFFSET ?`,
			)
			.all(scope.userId, scope.profileId, since, since, page.limit, page.offset)
			.map((row) => ({
				id: row.id,
				user_id: row.user_id,
				profile_id: row.profile_id,
				...(JSON.parse(row.data) as Record<string, unknown>),
				created_at: isoTime(row.created_at),
				updated_at: isoTime(row.updated_at),
			}));
	}

	item(
		entity: Entity,
		scope: Scope,
		key: string,
	): Record<string, unknown> | null {
		const row = this.db()
			.query<{ data: string }, [string, number, string]>(
				`SELECT data FROM ${TABLES[entity].items} WHERE user_id = ? AND profile_id = ? AND item_key = ?`,
			)
			.get(scope.userId, scope.profileId, key);
		return row ? (JSON.parse(row.data) as Record<string, unknown>) : null;
	}

	#event(entity: Entity, scope: Scope, event: EventInput): void {
		const db = this.db();
		const events = TABLES[entity].events;
		db.query(
			`DELETE FROM ${events} WHERE user_id = ? AND profile_id = ? AND item_key = ?`,
		).run(scope.userId, scope.profileId, event.key);
		db.query(
			`INSERT INTO ${events} (user_id, profile_id, item_key, operation, data, origin_client_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		).run(
			scope.userId,
			scope.profileId,
			event.key,
			event.operation,
			event.data,
			event.origin,
			this.now(),
		);
	}

	/** An item sent exactly as stored is a no-op: no write, no event. */
	upsertItems(
		entity: Entity,
		scope: Scope,
		inputs: ItemInput[],
		origin: string | null,
	): void {
		const db = this.db();
		const now = this.now();
		db.transaction(() => {
			for (const input of inputs) {
				const data = JSON.stringify(input.data);
				const stored = db
					.query<{ data: string }, [string, number, string]>(
						`SELECT data FROM ${TABLES[entity].items} WHERE user_id = ? AND profile_id = ? AND item_key = ?`,
					)
					.get(scope.userId, scope.profileId, input.key);
				if (stored?.data === data) {
					continue;
				}
				db.query(
					`INSERT INTO ${TABLES[entity].items} (user_id, profile_id, item_key, id, data, sort_at, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(user_id, profile_id, item_key) DO UPDATE SET
						data = excluded.data, sort_at = excluded.sort_at, updated_at = excluded.updated_at`,
				).run(
					scope.userId,
					scope.profileId,
					input.key,
					randomUUID(),
					data,
					input.sortAt,
					now,
					now,
				);
				this.#event(entity, scope, {
					key: input.key,
					operation: "upsert",
					data,
					origin,
				});
			}
		})();
	}

	deleteItems(
		entity: Entity,
		scope: Scope,
		keys: string[],
		origin: string | null,
	): void {
		const db = this.db();
		db.transaction(() => {
			for (const key of keys) {
				const removed = db
					.query<{ data: string }, [string, number, string]>(
						`DELETE FROM ${TABLES[entity].items} WHERE user_id = ? AND profile_id = ? AND item_key = ? RETURNING data`,
					)
					.get(scope.userId, scope.profileId, key);
				if (removed) {
					this.#event(entity, scope, {
						key,
						operation: "delete",
						data: removed.data,
						origin,
					});
				}
			}
		})();
	}

	/** Full replace: whatever the profile has that `inputs` lacks is deleted. */
	replaceItems(entity: Entity, scope: Scope, inputs: ItemInput[]): void {
		this.db().transaction(() => {
			const wanted = new Set(inputs.map((input) => input.key));
			const stale = this.db()
				.query<{ item_key: string }, [string, number]>(
					`SELECT item_key FROM ${TABLES[entity].items} WHERE user_id = ? AND profile_id = ?`,
				)
				.all(scope.userId, scope.profileId)
				.map((row) => row.item_key)
				.filter((key) => !wanted.has(key));
			this.deleteItems(entity, scope, stale, null);
			this.upsertItems(entity, scope, inputs, null);
		})();
	}

	delta(entity: Entity, scope: Scope, since: number, limit: number) {
		return this.db()
			.query<
				{ event_id: number; operation: string; data: string },
				[string, number, number, number]
			>(
				`SELECT event_id, operation, data FROM ${TABLES[entity].events}
				 WHERE user_id = ? AND profile_id = ? AND event_id > ?
				 ORDER BY event_id LIMIT ?`,
			)
			.all(scope.userId, scope.profileId, since, limit)
			.map((row) => ({
				event_id: row.event_id,
				operation: row.operation,
				...(JSON.parse(row.data) as Record<string, unknown>),
			}));
	}

	cursor(entity: Entity, scope: Scope): number {
		return (
			this.db()
				.query<{ cursor: number | null }, [string, number]>(
					`SELECT MAX(event_id) AS cursor FROM ${TABLES[entity].events} WHERE user_id = ? AND profile_id = ?`,
				)
				.get(scope.userId, scope.profileId)?.cursor ?? 0
		);
	}

	// Settings, home catalog settings, collections

	blob(
		kind: BlobKind,
		scope: Scope,
		platform: string,
	): { id: string; json: unknown; updated_at: string } | null {
		const row = this.db()
			.query<
				{ id: string; json: string; updated_at: number },
				[string, string, number, string]
			>(
				"SELECT id, json, updated_at FROM backend_blobs WHERE kind = ? AND user_id = ? AND profile_id = ? AND platform = ?",
			)
			.get(kind, scope.userId, scope.profileId, platform);
		return row
			? {
					id: row.id,
					json: JSON.parse(row.json),
					updated_at: isoTime(row.updated_at),
				}
			: null;
	}

	writeBlob(
		kind: BlobKind,
		scope: Scope,
		platform: string,
		json: unknown,
	): void {
		this.db()
			.query(
				`INSERT INTO backend_blobs (kind, user_id, profile_id, platform, id, json, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(kind, user_id, profile_id, platform) DO UPDATE SET
					json = excluded.json, updated_at = excluded.updated_at`,
			)
			.run(
				kind,
				scope.userId,
				scope.profileId,
				platform,
				randomUUID(),
				JSON.stringify(json),
				this.now(),
			);
	}

	/** Rows per profile index, for the sync overview. */
	counts(table: "addons" | Entity, userId: string): Record<string, number> {
		const name = table === "addons" ? "backend_addons" : TABLES[table].items;
		const rows = this.db()
			.query<{ profile_id: number; total: number }, [string]>(
				`SELECT profile_id, COUNT(*) AS total FROM ${name} WHERE user_id = ? GROUP BY profile_id`,
			)
			.all(userId);
		return Object.fromEntries(
			rows.map((row) => [String(row.profile_id), row.total]),
		);
	}
}
