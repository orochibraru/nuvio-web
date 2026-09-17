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

/** How much of the sign-in event log is kept. Older rows are pruned on write. */
export const SIGN_IN_EVENT_RETENTION_DAYS = 90;

const MS_PER_DAY = 86_400_000;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Records one successful sign-in or sign-up: upserts the person's summary row
 * *and* appends an event.
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

/** One day of the activity chart. `day` is `YYYY-MM-DD`, UTC. */
export interface SignInDay {
	day: string;
	signIns: number;
	people: number;
}

function utcDay(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Sign-ins per day over the last `days` days, oldest first, **including the
 * days with none**.
 *
 * The gaps are the point: a chart built only from the days that have rows draws
 * a quiet week as a continuous line and misrepresents it. Days are UTC so the
 * buckets do not shift with the server's timezone.
 */
export function signInsPerDay(
	db: Database,
	days = 30,
	now = Date.now(),
): SignInDay[] {
	const since = now - (days - 1) * MS_PER_DAY;
	const rows = db
		.query(
			`SELECT at, email FROM sign_in_events
			 WHERE at >= $since ORDER BY at`,
		)
		.all({ $since: new Date(utcDay(since)).getTime() }) as Array<{
		at: number;
		email: string;
	}>;

	const buckets = new Map<string, Set<string>>();
	const counts = new Map<string, number>();
	for (const row of rows) {
		const day = utcDay(row.at);
		counts.set(day, (counts.get(day) ?? 0) + 1);
		const people = buckets.get(day) ?? new Set<string>();
		people.add(row.email);
		buckets.set(day, people);
	}

	const out: SignInDay[] = [];
	for (let index = 0; index < days; index++) {
		const day = utcDay(since + index * MS_PER_DAY);
		out.push({
			day,
			signIns: counts.get(day) ?? 0,
			people: buckets.get(day)?.size ?? 0,
		});
	}
	return out;
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
