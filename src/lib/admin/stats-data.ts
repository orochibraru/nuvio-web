import type { Database } from "bun:sqlite";

const MS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;
const MS_PER_HOUR = 3_600_000;

export interface Comparison {
	current: number;
	previous: number;
}

export interface StatsOverview {
	dailyActive: Comparison;
	weeklyActive: Comparison;
	monthlyActive: Comparison;
	newAccounts: Comparison;
	totalAccounts: number;
	liveSessions: number;
	plays: Comparison;
	hoursWatched: Comparison;
}

/** One bar of a daily chart. `day` is `YYYY-MM-DD`, UTC. */
export interface DayValue {
	day: string;
	value: number;
	people: number;
}

export interface WeekSplit {
	weekStart: string;
	newPeople: number;
	returningPeople: number;
}

export interface TopTitle {
	contentId: string;
	contentType: string;
	name: string;
	accounts: number;
	plays: number;
}

export function utcDay(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function startOfUtcDay(timestamp: number): number {
	return timestamp - (timestamp % MS_PER_DAY);
}

function hasUserData(db: Database): boolean {
	return (
		db
			.query<{ found: number }, []>(
				"SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'userdata_records'",
			)
			.get() !== null
	);
}

// Complete UTC days only, so "yesterday vs the day before" compares like with like.
function windows(now: number, days: number) {
	const end = startOfUtcDay(now);
	return {
		current: [end - days * MS_PER_DAY, end] as const,
		previous: [end - 2 * days * MS_PER_DAY, end - days * MS_PER_DAY] as const,
	};
}

function distinctActive(db: Database, from: number, to: number): number {
	return (
		db
			.query<{ count: number }, [number, number]>(
				"SELECT COUNT(DISTINCT email) AS count FROM sign_in_events WHERE at >= ? AND at < ?",
			)
			.get(from, to)?.count ?? 0
	);
}

function compare(
	now: number,
	days: number,
	count: (from: number, to: number) => number,
): Comparison {
	const { current, previous } = windows(now, days);
	return {
		current: count(...current),
		previous: count(...previous),
	};
}

function watchTotals(
	db: Database,
	from: number,
	to: number,
): { plays: number; hours: number } {
	if (!hasUserData(db)) {
		return { plays: 0, hours: 0 };
	}
	const row = db
		.query<{ plays: number; watched: number | null }, [number, number]>(
			`SELECT COUNT(*) AS plays,
				SUM(MIN(
					json_extract(record, '$.position'),
					CASE WHEN json_extract(record, '$.duration') > 0
						THEN json_extract(record, '$.duration')
						ELSE json_extract(record, '$.position') END
				)) AS watched
			FROM userdata_records
			WHERE entity = 'progress' AND deleted = 0 AND updated_at >= ? AND updated_at < ?`,
		)
		.get(from, to);
	return {
		plays: row?.plays ?? 0,
		hours: Math.round(((row?.watched ?? 0) / MS_PER_HOUR) * 10) / 10,
	};
}

export function statsOverview(db: Database, now = Date.now()): StatsOverview {
	const active = (from: number, to: number) => distinctActive(db, from, to);
	const watchWeek = windows(now, 7);
	const currentWatch = watchTotals(db, ...watchWeek.current);
	const previousWatch = watchTotals(db, ...watchWeek.previous);
	return {
		dailyActive: compare(now, 1, active),
		weeklyActive: compare(now, 7, active),
		monthlyActive: compare(now, 30, active),
		newAccounts: compare(
			now,
			30,
			(from, to) =>
				db
					.query<{ count: number }, [number, number]>(
						"SELECT COUNT(*) AS count FROM sign_ins WHERE first_seen_at >= ? AND first_seen_at < ?",
					)
					.get(from, to)?.count ?? 0,
		),
		totalAccounts:
			db
				.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM sign_ins")
				.get()?.count ?? 0,
		liveSessions:
			db
				.query<{ count: number }, [number]>(
					"SELECT COUNT(*) AS count FROM sessions WHERE last_seen_at >= ?",
				)
				.get(Math.floor(now / 1000) - 30 * SECONDS_PER_DAY)?.count ?? 0,
		plays: { current: currentWatch.plays, previous: previousWatch.plays },
		hoursWatched: {
			current: currentWatch.hours,
			previous: previousWatch.hours,
		},
	};
}

// Every day in the window, the empty ones included, oldest first; today is the last bar.
function fillDays(
	now: number,
	days: number,
	rows: Array<{ day: string; value: number; people: number }>,
): DayValue[] {
	const byDay = new Map(rows.map((row) => [row.day, row]));
	const first = startOfUtcDay(now) - (days - 1) * MS_PER_DAY;
	const out: DayValue[] = [];
	for (let index = 0; index < days; index++) {
		const day = utcDay(first + index * MS_PER_DAY);
		const row = byDay.get(day);
		out.push({ day, value: row?.value ?? 0, people: row?.people ?? 0 });
	}
	return out;
}

function firstDay(now: number, days: number): number {
	return startOfUtcDay(now) - (days - 1) * MS_PER_DAY;
}

export function activePerDay(
	db: Database,
	days = 90,
	now = Date.now(),
): DayValue[] {
	const rows = db
		.query<{ day: string; people: number }, [number]>(
			`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day,
				COUNT(DISTINCT email) AS people
			FROM sign_in_events WHERE at >= ? GROUP BY day`,
		)
		.all(firstDay(now, days));
	return fillDays(
		now,
		days,
		rows.map((row) => ({
			day: row.day,
			value: row.people,
			people: row.people,
		})),
	);
}

export function signInsPerDay(
	db: Database,
	days = 90,
	now = Date.now(),
): DayValue[] {
	const rows = db
		.query<{ day: string; value: number; people: number }, [number]>(
			`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day,
				COUNT(*) AS value, COUNT(DISTINCT email) AS people
			FROM sign_in_events WHERE kind = 'sign_in' AND at >= ? GROUP BY day`,
		)
		.all(firstDay(now, days));
	return fillDays(now, days, rows);
}

export function newAccountsPerDay(
	db: Database,
	days = 90,
	now = Date.now(),
): DayValue[] {
	const rows = db
		.query<{ day: string; value: number }, [number]>(
			`SELECT strftime('%Y-%m-%d', first_seen_at / 1000, 'unixepoch') AS day,
				COUNT(*) AS value
			FROM sign_ins WHERE first_seen_at >= ? GROUP BY day`,
		)
		.all(firstDay(now, days));
	return fillDays(
		now,
		days,
		rows.map((row) => ({ ...row, people: row.value })),
	);
}

export function playsPerDay(
	db: Database,
	days = 90,
	now = Date.now(),
): DayValue[] {
	if (!hasUserData(db)) {
		return fillDays(now, days, []);
	}
	const rows = db
		.query<{ day: string; value: number; people: number }, [number]>(
			`SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch') AS day,
				COUNT(*) AS value, COUNT(DISTINCT user_id) AS people
			FROM userdata_records
			WHERE entity = 'progress' AND deleted = 0 AND updated_at >= ?
			GROUP BY day`,
		)
		.all(firstDay(now, days));
	return fillDays(now, days, rows);
}

// Seven-day blocks ending today; "new" means the person's first sign-in here falls in that block.
export function weeklyNewAndReturning(
	db: Database,
	weeks = 8,
	now = Date.now(),
): WeekSplit[] {
	const start = startOfUtcDay(now) + MS_PER_DAY - weeks * 7 * MS_PER_DAY;
	const week = 7 * MS_PER_DAY;
	const active = db
		.query<{ email: string; week: number }, [number, number]>(
			`SELECT DISTINCT email, (at - ?1) / ?2 AS week
			FROM sign_in_events WHERE at >= ?1`,
		)
		.all(start, week);
	const firstSeen = new Map(
		db
			.query<{ email: string; first_seen_at: number }, [number]>(
				"SELECT email, first_seen_at FROM sign_ins WHERE first_seen_at >= ?",
			)
			.all(start)
			.map((row) => [
				row.email,
				Math.floor((row.first_seen_at - start) / week),
			]),
	);
	const out: WeekSplit[] = Array.from({ length: weeks }, (_, index) => ({
		weekStart: utcDay(start + index * week),
		newPeople: 0,
		returningPeople: 0,
	}));
	for (const row of active) {
		const bucket = out[row.week];
		if (!bucket) {
			continue;
		}
		if (firstSeen.get(row.email) === row.week) {
			bucket.newPeople++;
		} else {
			bucket.returningPeople++;
		}
	}
	return out;
}

export function topTitles(
	db: Database,
	days = 7,
	limit = 10,
	now = Date.now(),
): TopTitle[] {
	if (!hasUserData(db)) {
		return [];
	}
	const top = db
		.query<
			{
				content_id: string;
				content_type: string;
				accounts: number;
				plays: number;
			},
			[number, number]
		>(
			`SELECT json_extract(record, '$.contentId') AS content_id,
				MAX(json_extract(record, '$.contentType')) AS content_type,
				COUNT(DISTINCT user_id) AS accounts,
				SUM(entity = 'progress') AS plays
			FROM userdata_records
			WHERE entity IN ('progress', 'history') AND deleted = 0 AND updated_at >= ?
			GROUP BY content_id
			ORDER BY accounts DESC, plays DESC, content_id
			LIMIT ?`,
		)
		.all(now - days * MS_PER_DAY, limit);
	if (top.length === 0) {
		return [];
	}
	const ids = top.map((row) => row.content_id);
	const names = new Map<string, string>();
	const rows = db
		.query<{ content_id: string; name: string | null }, string[]>(
			`SELECT json_extract(record, '$.contentId') AS content_id,
				COALESCE(json_extract(record, '$.title'), json_extract(record, '$.name')) AS name
			FROM userdata_records
			WHERE entity IN ('history', 'library')
				AND json_extract(record, '$.contentId') IN (${ids.map(() => "?").join(", ")})
			ORDER BY entity DESC`,
		)
		.all(...ids);
	for (const row of rows) {
		if (row.name && !names.has(row.content_id)) {
			names.set(row.content_id, row.name);
		}
	}
	return top.map((row) => ({
		contentId: row.content_id,
		contentType: row.content_type,
		name: names.get(row.content_id) ?? row.content_id,
		accounts: row.accounts,
		plays: row.plays,
	}));
}
