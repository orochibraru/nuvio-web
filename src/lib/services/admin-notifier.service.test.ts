import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMessage } from "#lib/notifications/types.js";
import {
	AdminNotifierService,
	NOTIFICATION_RETENTION_DAYS,
} from "./admin-notifier.service.ts";
import { DatabaseService } from "./database.service.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-02T12:00:00Z");
const NOTIFICATION = {
	kind: "custom_backend_seen" as const,
	backendId: "b1",
	url: "https://backend.example.com",
};

let db: Database;
let send: ReturnType<typeof vi.fn<(message: MailMessage) => Promise<boolean>>>;
let service: AdminNotifierService;

beforeEach(() => {
	db = DatabaseService.migrate(new Database(":memory:"));
	send = vi.fn(async (_message: MailMessage) => true);
	service = new AdminNotifierService(
		{ connect: () => db },
		{ emails: ["boss@example.com", "other@example.com"] },
		{ send },
		{ error: vi.fn() },
	);
	vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

afterEach(() => {
	vi.useRealTimers();
});

describe("AdminNotifierService", () => {
	it("stores the notification as its code and data", async () => {
		await service.notify(NOTIFICATION);
		expect(service.list("boss@example.com")).toEqual([
			{ id: 1, notification: NOTIFICATION, createdAt: NOW, read: false },
		]);
		expect(service.unreadCount("boss@example.com")).toBe(1);
	});

	it("emails only the admins who opted in", async () => {
		service.setEmailEnabled("Boss@Example.com", true);
		await service.notify(NOTIFICATION);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({
			to: "boss@example.com",
			subject: expect.any(String),
			text: expect.stringContaining(
				"A new custom backend is in use: https://backend.example.com",
			),
		});

		service.setEmailEnabled("boss@example.com", false);
		await service.notify(NOTIFICATION);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("keeps read state per admin and lists unread first", async () => {
		await service.notify(NOTIFICATION);
		vi.setSystemTime(NOW + 1000);
		await service.notify({ ...NOTIFICATION, backendId: "b2" });

		service.markRead("boss@example.com", 2);
		service.markRead("boss@example.com", 2);
		expect(
			service.list("boss@example.com").map((item) => [item.id, item.read]),
		).toEqual([
			[1, false],
			[2, true],
		]);
		expect(service.unreadCount("other@example.com")).toBe(2);

		service.markAllRead("boss@example.com");
		expect(service.unreadCount("boss@example.com")).toBe(0);
		expect(service.unreadCount("other@example.com")).toBe(2);
	});

	it("prunes notifications past the retention window on write", async () => {
		await service.notify(NOTIFICATION);
		vi.setSystemTime(NOW + (NOTIFICATION_RETENTION_DAYS + 1) * DAY);
		await service.notify({ ...NOTIFICATION, backendId: "b2" });
		expect(
			service
				.list("boss@example.com")
				.map((item) => item.notification.backendId),
		).toEqual(["b2"]);
	});

	it("does not throw when the database is unavailable", async () => {
		const broken = new AdminNotifierService(
			{
				connect: () => {
					throw new Error("read-only");
				},
			},
			{ emails: ["boss@example.com"] },
			{ send },
			{ error: vi.fn() },
		);
		await expect(broken.notify(NOTIFICATION)).resolves.toBeUndefined();
		expect(send).not.toHaveBeenCalled();
	});
});
