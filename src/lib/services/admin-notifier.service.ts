import type { Database } from "bun:sqlite";
import {
	type EmailContent,
	emailHtml,
	emailText,
} from "#lib/notifications/email.js";
import type {
	AdminNotification,
	AdminNotifier,
	MailSender,
} from "#lib/notifications/types.js";
import { serviceToken } from "./container.ts";
import type { DatabaseService } from "./database.service.ts";
import type { Logger } from "./logger.service.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admin_notifications (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	kind        TEXT NOT NULL,
	payload     TEXT NOT NULL,
	created_at  INTEGER NOT NULL,
	read_by     TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS admin_notifications_created_at
	ON admin_notifications (created_at);

CREATE TABLE IF NOT EXISTS admin_preferences (
	email                TEXT PRIMARY KEY,
	email_notifications  INTEGER NOT NULL DEFAULT 0
);
`;

// The full service, for the admin page; everything else asks for ADMIN_NOTIFIER.
export const ADMIN_NOTIFICATIONS = serviceToken<AdminNotifierService>(
	"AdminNotifierService",
);

export const NOTIFICATION_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const LIST_LIMIT = 200;

export interface StoredNotification {
	id: number;
	notification: AdminNotification;
	createdAt: number;
	read: boolean;
}

function fold(email: string): string {
	return email.trim().toLowerCase();
}

export function notificationEmail(
	notification: AdminNotification,
	adminUrl: string,
): { subject: string; text: string; html: string } {
	const content: EmailContent = {
		preview: `Someone signed in through ${notification.url}`,
		heading: "A new custom backend is in use",
		paragraphs: [
			"Someone signed in to your Nuvio server through a backend it hadn't seen before.",
		],
		detail: notification.url,
		action: { label: "Review it in Backends", url: adminUrl },
		footnote:
			"You get this because your address is in NUVIO_ADMIN_EMAILS and email notifications are on in the admin page.",
	};
	return {
		subject: "Nuvio: a new custom backend is in use",
		text: emailText(content),
		html: emailHtml(content),
	};
}

// Singleton. Admins come from NUVIO_ADMIN_EMAILS; read state and opt-in are per admin email.
export class AdminNotifierService implements AdminNotifier {
	#migrated: Database | null = null;

	constructor(
		private readonly database: Pick<DatabaseService, "connect">,
		private readonly admins: { readonly emails: readonly string[] },
		private readonly mailer: MailSender,
		private readonly logger: Pick<Logger, "error">,
	) {}

	async notify(
		notification: AdminNotification,
		adminUrl: string,
	): Promise<void> {
		let recipients: string[];
		try {
			const db = this.#db();
			const now = Date.now();
			db.run(
				"INSERT INTO admin_notifications (kind, payload, created_at) VALUES (?, ?, ?)",
				[notification.kind, JSON.stringify(notification), now],
			);
			db.run("DELETE FROM admin_notifications WHERE created_at < ?", [
				now - NOTIFICATION_RETENTION_DAYS * MS_PER_DAY,
			]);
			recipients = this.admins.emails.filter((email) =>
				this.emailEnabled(email),
			);
		} catch (error) {
			this.logger.error("Could not store an admin notification", {
				error: error instanceof Error ? error : "Unknown error",
			});
			return;
		}
		const email = notificationEmail(notification, adminUrl);
		await Promise.all(
			recipients.map((to) => this.mailer.send({ to, ...email })),
		);
	}

	list(adminEmail: string): StoredNotification[] {
		return this.#db()
			.query<
				{ id: number; payload: string; created_at: number; read: number },
				[string, number]
			>(
				`SELECT id, payload, created_at,
					EXISTS (SELECT 1 FROM json_each(read_by) WHERE value = ?1) AS read
				FROM admin_notifications
				ORDER BY read, created_at DESC, id DESC LIMIT ?2`,
			)
			.all(fold(adminEmail), LIST_LIMIT)
			.map((row) => ({
				id: row.id,
				notification: JSON.parse(row.payload) as AdminNotification,
				createdAt: row.created_at,
				read: row.read === 1,
			}));
	}

	unreadCount(adminEmail: string): number {
		return (
			this.#db()
				.query<{ count: number }, [string]>(
					`SELECT COUNT(*) AS count FROM admin_notifications
					WHERE NOT EXISTS (SELECT 1 FROM json_each(read_by) WHERE value = ?1)`,
				)
				.get(fold(adminEmail))?.count ?? 0
		);
	}

	markRead(adminEmail: string, id: number): void {
		this.#db().run(
			`UPDATE admin_notifications SET read_by = json_insert(read_by, '$[#]', ?1)
			WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM json_each(read_by) WHERE value = ?1)`,
			[fold(adminEmail), id],
		);
	}

	markAllRead(adminEmail: string): void {
		this.#db().run(
			`UPDATE admin_notifications SET read_by = json_insert(read_by, '$[#]', ?1)
			WHERE NOT EXISTS (SELECT 1 FROM json_each(read_by) WHERE value = ?1)`,
			[fold(adminEmail)],
		);
	}

	emailEnabled(adminEmail: string): boolean {
		const row = this.#db()
			.query<{ email_notifications: number }, [string]>(
				"SELECT email_notifications FROM admin_preferences WHERE email = ?",
			)
			.get(fold(adminEmail));
		return row?.email_notifications === 1;
	}

	setEmailEnabled(adminEmail: string, enabled: boolean): void {
		this.#db().run(
			`INSERT INTO admin_preferences (email, email_notifications) VALUES (?1, ?2)
			ON CONFLICT(email) DO UPDATE SET email_notifications = ?2`,
			[fold(adminEmail), enabled ? 1 : 0],
		);
	}

	#db(): Database {
		const db = this.database.connect();
		if (this.#migrated !== db) {
			db.run(SCHEMA);
			this.#migrated = db;
		}
		return db;
	}
}
