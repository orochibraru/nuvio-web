import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserDataEvents } from "#lib/userdata/events.js";
import { NUVIO_SYNC, USER_DATA_EVENTS } from "#lib/userdata/tokens.js";
import type { UserDataEvent } from "#lib/userdata/types.js";
import { GET } from "./+server.ts";

const change: UserDataEvent = {
	changes: { library: { "movie:tt1": null } },
	cursors: { library: 2, watchProgress: 2, watchHistory: 2 },
	since: { library: 1, watchProgress: 1, watchHistory: 1 },
};

let events: UserDataEvents;
let touch: ReturnType<typeof vi.fn>;

function call(
	options: { session?: boolean; profileId?: number | null } = {},
	controller = new AbortController(),
) {
	const services = new Map<unknown, unknown>([
		[USER_DATA_EVENTS, events],
		[NUVIO_SYNC, { touch }],
	]);
	const response = GET({
		request: new Request("http://localhost/api/events", {
			signal: controller.signal,
		}),
		locals: {
			session: options.session === false ? null : { user: { id: "u" } },
			profileId: options.profileId === undefined ? 1 : options.profileId,
			services: { get: (token: unknown) => services.get(token) },
		},
	} as unknown as Parameters<typeof GET>[0]) as Response;
	return { response, controller };
}

/** Subscriptions the route holds right now. */
let live = 0;

function trackSubscriptions(target: UserDataEvents): void {
	const subscribe = target.subscribe.bind(target);
	vi.spyOn(target, "subscribe").mockImplementation(
		(user, profile, listener) => {
			live += 1;
			const off = subscribe(user, profile, listener);
			return () => {
				live -= 1;
				off();
			};
		},
	);
}

async function read(response: Response): Promise<string> {
	const reader = (response.body as ReadableStream<Uint8Array>).getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	return new TextDecoder().decode(value);
}

beforeEach(() => {
	vi.useFakeTimers();
	events = new UserDataEvents();
	live = 0;
	trackSubscriptions(events);
	touch = vi.fn();
});

afterEach(() => {
	vi.useRealTimers();
});

async function status(run: () => unknown): Promise<number> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
	return 200;
}

describe("GET /api/events", () => {
	it("requires a session and an active profile", async () => {
		expect(await status(() => call({ session: false }))).toBe(401);
		expect(await status(() => call({ profileId: null }))).toBe(401);
	});

	it("streams server-sent events with no buffering", async () => {
		const { response, controller } = call();
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(response.headers.get("cache-control")).toBe(
			"no-cache, no-transform",
		);
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		expect(await read(response)).toBe("retry: 5000\n\n");
		controller.abort();
	});

	it("writes each change for this user and profile, cursors included", async () => {
		const { response, controller } = call();
		await read(response);
		events.emit("u", 2, change);
		events.emit("u", 1, change);
		expect(await read(response)).toBe(
			`event: changes\ndata: ${JSON.stringify(change)}\n\n`,
		);
		controller.abort();
	});

	it("marks the user active on connect and on every ping", async () => {
		const { response, controller } = call();
		await read(response);
		expect(touch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(25_000);
		expect(await read(response)).toBe(": ping\n\n");
		expect(touch).toHaveBeenCalledTimes(2);
		controller.abort();
	});

	it("unsubscribes and stops pinging when the client goes away", async () => {
		const { response, controller } = call();
		await read(response);
		expect(live).toBe(1);
		controller.abort();
		expect(live).toBe(0);
		vi.advanceTimersByTime(60_000);
		expect(touch).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cleans up the same way when the stream is cancelled", async () => {
		const { response } = call();
		await (response.body as ReadableStream).cancel();
		expect(live).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves nothing behind for a request already aborted", () => {
		const controller = new AbortController();
		controller.abort();
		call({}, controller);
		expect(live).toBe(0);
		expect(touch).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});
