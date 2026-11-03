import { error } from "@sveltejs/kit";
import { m } from "#lib/i18n/index.js";
import { PROFILE_MISMATCH_STATUS } from "#lib/sync/types.js";
import { NUVIO_SYNC, USER_DATA_EVENTS } from "#lib/userdata/tokens.js";
import type { UserDataEvent } from "#lib/userdata/types.js";
import type { RequestHandler } from "./$types";

const PING_MS = 25_000;
const MAX_STREAMS_PER_USER = 10;

/**
 * Live user-data changes for the active profile (which the tab names in
 * `?profile=`), as server-sent events: one
 * `changes` event per write or Nuvio pull, a ping to keep proxies from
 * closing an idle stream. An open stream keeps the user on the Nuvio sync
 * schedule. Only singletons are held: the request scope is disposed as soon
 * as this returns, long before the stream ends.
 */
export const GET: RequestHandler = ({ locals, request, url }) => {
	const userId = locals.session?.accountKey;
	const profileId = locals.profileId;
	if (userId === undefined || profileId == null) {
		error(401, m.error_no_active_profile());
	}
	// The tab says which profile it shows: the shared cookie may since name another.
	if (Number(url.searchParams.get("profile")) !== profileId) {
		error(PROFILE_MISMATCH_STATUS, m.error_profile_changed());
	}
	const events = locals.services.get(USER_DATA_EVENTS);
	if (events.count(userId) >= MAX_STREAMS_PER_USER) {
		error(429, m.error_too_many_streams());
	}
	const nuvioSync = locals.services.get(NUVIO_SYNC);
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;
	const stop = () => {
		unsubscribe?.();
		unsubscribe = undefined;
		clearInterval(ping);
		request.signal.removeEventListener("abort", onAbort);
	};
	let onAbort = stop;

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			if (request.signal.aborted) {
				controller.close();
				return;
			}
			const send = (text: string) => {
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					stop();
				}
			};
			onAbort = () => {
				stop();
				try {
					controller.close();
				} catch {
					// already closed or cancelled
				}
			};
			request.signal.addEventListener("abort", onAbort);
			unsubscribe = events.subscribe(
				userId,
				profileId,
				(event: UserDataEvent) =>
					send(`event: changes\ndata: ${JSON.stringify(event)}\n\n`),
			);
			ping = setInterval(() => {
				nuvioSync.touch(userId);
				send(": ping\n\n");
			}, PING_MS);
			nuvioSync.touch(userId);
			send("retry: 5000\n\n");
		},
		cancel: stop,
	});

	return new Response(body, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
};
