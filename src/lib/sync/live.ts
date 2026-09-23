import type { UserDataEvent } from "#lib/userdata/types.js";
import { resolve } from "$app/paths";
import type { SyncCursors } from "./types.ts";

/**
 * A pushed change is applied as is when it follows on from our cursors,
 * dropped when we already have it, and anything else is a gap a delta pull
 * fills (so is every change before the first snapshot).
 */
export function streamedAction(
	ours: SyncCursors,
	event: UserDataEvent,
	bootstrapped: boolean,
): "skip" | "apply" | "catch-up" {
	const keys = Object.keys(ours) as Array<keyof SyncCursors>;
	if (keys.every((key) => event.cursors[key] <= ours[key])) {
		return "skip";
	}
	if (bootstrapped && keys.every((key) => event.since[key] === ours[key])) {
		return "apply";
	}
	return "catch-up";
}

const POLL_MS = 90_000;
// While the stream is open the poll is only a safety net.
const STREAMING_POLL_MS = 10 * 60_000;

/**
 * A tab's live connection to its profile's server-sent changes
 * (`/api/events`), and the delta poll it paces: every 90 s without it, every
 * 10 min while it is open. One per tab; the server fans out.
 */
export class LiveSync {
	#source: EventSource | undefined;
	#timer: ReturnType<typeof setInterval> | undefined;
	#pollMs = 0;

	constructor(
		private readonly handlers: {
			poll: () => void;
			/** After a reconnect: whatever changed meanwhile never came down. */
			catchUp: () => void;
			change: (event: UserDataEvent) => void;
		},
	) {
		this.#poll(POLL_MS);
	}

	/** Opens the stream unless offline or one is already open or connecting. */
	connect(): void {
		if (
			typeof EventSource === "undefined" ||
			navigator.onLine === false ||
			(this.#source && this.#source.readyState !== EventSource.CLOSED)
		) {
			return;
		}
		const source = new EventSource(resolve("api/events"));
		this.#source = source;
		let opened = false;
		source.onopen = () => {
			this.#poll(STREAMING_POLL_MS);
			if (opened) {
				this.handlers.catchUp();
			}
			opened = true;
		};
		// Fires on every failed retry too; `#poll` ignores the repeats.
		source.onerror = () => this.#poll(POLL_MS);
		source.addEventListener("changes", (event) => {
			if (this.#source === source) {
				this.handlers.change(JSON.parse(event.data) as UserDataEvent);
			}
		});
	}

	close(): void {
		clearInterval(this.#timer);
		this.#source?.close();
		this.#source = undefined;
	}

	#poll(ms: number): void {
		if (this.#pollMs === ms) {
			return;
		}
		clearInterval(this.#timer);
		this.#pollMs = ms;
		this.#timer = setInterval(this.handlers.poll, ms);
	}
}
