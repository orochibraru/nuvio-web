import type { Database } from "bun:sqlite";

/**
 * Queries behind the admin page. Every function takes its `Database` so the
 * unit tests can run them against an in-memory one : the module never reaches
 * for the singleton itself.
 *
 * Emails are the identity here and are stored folded to lowercase, because
 * that is the only way an allowlist typed by a human matches what the auth
 * provider hands back.
 */

export interface AllowlistEntry {
	email: string;
	addedAt: number;
	addedBy: string;
}

const LOCK_KEY = "access.locked";

/** How much of the sign-in event log is kept. Older rows are pruned on write. */
export const SIGN_IN_EVENT_RETENTION_DAYS = 90;

const MS_PER_DAY = 86_400_000;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Records one successful sign-in or sign-up: upserts the person's summary row
 * and also appends an event.
 *
 * Both, because they answer different questions. `sign_ins` answers "who has
 * used this instance" in one row per person; `sign_in_events` answers "when",
 * which a summary cannot reconstruct.
 */
export function recordSignIn(
	db: Database,
	email: string,
	userId: string,
	now = Date.now(),
): void {
	const normalized = normalizeEmail(email);
	db.query(
		`INSERT INTO sign_ins (email, user_id, first_seen_at, last_seen_at, sign_in_count)
		 VALUES ($email, $userId, $now, $now, 1)
		 ON CONFLICT(email) DO UPDATE SET
			 last_seen_at = $now,
			 user_id = $userId,
			 sign_in_count = sign_in_count + 1`,
	).run({ $email: normalized, $userId: userId, $now: now });
	db.query("INSERT INTO sign_in_events (email, at) VALUES ($email, $now)").run({
		$email: normalized,
		$now: now,
	});
	// Pruned here rather than on a timer: sign-in is the only thing that grows
	// this table, and it is rare enough that a delete on the indexed column
	// costs nothing worth scheduling around.
	db.query("DELETE FROM sign_in_events WHERE at < $cutoff").run({
		$cutoff: now - SIGN_IN_EVENT_RETENTION_DAYS * MS_PER_DAY,
	});
}

// One "active" row per person per UTC day; a repeat is ignored by the unique index.
export function recordActive(
	db: Database,
	email: string,
	now = Date.now(),
): void {
	db.query(
		"INSERT OR IGNORE INTO sign_in_events (email, at, kind) VALUES ($email, $day, 'active')",
	).run({ $email: normalizeEmail(email), $day: now - (now % MS_PER_DAY) });
	db.query("DELETE FROM sign_in_events WHERE at < $cutoff").run({
		$cutoff: now - SIGN_IN_EVENT_RETENTION_DAYS * MS_PER_DAY,
	});
}

export function isLocked(db: Database): boolean {
	const row = db
		.query("SELECT value FROM settings WHERE key = ?")
		.get(LOCK_KEY) as { value: string } | null;
	return row?.value === "1";
}

export function setLocked(db: Database, locked: boolean): void {
	db.query(
		`INSERT INTO settings (key, value) VALUES ($key, $value)
		 ON CONFLICT(key) DO UPDATE SET value = $value`,
	).run({ $key: LOCK_KEY, $value: locked ? "1" : "0" });
}

export function listAllowlist(db: Database): AllowlistEntry[] {
	return db
		.query("SELECT email, added_at, added_by FROM allowlist ORDER BY email")
		.all()
		.map((row) => {
			const entry = row as {
				email: string;
				added_at: number;
				added_by: string;
			};
			return {
				email: entry.email,
				addedAt: entry.added_at,
				addedBy: entry.added_by,
			};
		});
}

export function addToAllowlist(
	db: Database,
	email: string,
	addedBy: string,
	now = Date.now(),
): void {
	db.query(
		`INSERT INTO allowlist (email, added_at, added_by)
		 VALUES ($email, $now, $addedBy)
		 ON CONFLICT(email) DO NOTHING`,
	).run({
		$email: normalizeEmail(email),
		$now: now,
		$addedBy: normalizeEmail(addedBy),
	});
}

export function removeFromAllowlist(db: Database, email: string): void {
	db.query("DELETE FROM allowlist WHERE email = ?").run(normalizeEmail(email));
}

export function isOnAllowlist(db: Database, email: string): boolean {
	const row = db
		.query("SELECT 1 AS ok FROM allowlist WHERE email = ?")
		.get(normalizeEmail(email)) as { ok: number } | null;
	return row !== null;
}

/**
 * The single question the auth path asks. Admins pass unconditionally so a
 * bad allowlist can't lock the host out of the page that edits it; when the
 * instance is unlocked, everyone passes.
 */
export function canSignIn(
	db: Database,
	email: string,
	isAdmin: boolean,
): boolean {
	if (isAdmin || !isLocked(db)) {
		return true;
	}
	return isOnAllowlist(db, email);
}
