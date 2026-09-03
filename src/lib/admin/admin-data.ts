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

export interface SignInRecord {
	email: string;
	userId: string;
	firstSeenAt: number;
	lastSeenAt: number;
	signInCount: number;
}

export interface AllowlistEntry {
	email: string;
	addedAt: number;
	addedBy: string;
}

const LOCK_KEY = "access.locked";

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** Upserts one person's row. Called on every successful sign-in and sign-up. */
export function recordSignIn(
	db: Database,
	email: string,
	userId: string,
	now = Date.now(),
): void {
	db.query(
		`INSERT INTO sign_ins (email, user_id, first_seen_at, last_seen_at, sign_in_count)
		 VALUES ($email, $userId, $now, $now, 1)
		 ON CONFLICT(email) DO UPDATE SET
			 last_seen_at = $now,
			 user_id = $userId,
			 sign_in_count = sign_in_count + 1`,
	).run({ $email: normalizeEmail(email), $userId: userId, $now: now });
}

export function listSignIns(db: Database): SignInRecord[] {
	return db
		.query(
			`SELECT email, user_id, first_seen_at, last_seen_at, sign_in_count
			 FROM sign_ins ORDER BY last_seen_at DESC`,
		)
		.all()
		.map((row) => {
			const record = row as {
				email: string;
				user_id: string;
				first_seen_at: number;
				last_seen_at: number;
				sign_in_count: number;
			};
			return {
				email: record.email,
				userId: record.user_id,
				firstSeenAt: record.first_seen_at,
				lastSeenAt: record.last_seen_at,
				signInCount: record.sign_in_count,
			};
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
