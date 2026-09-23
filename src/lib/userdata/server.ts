import { type AuthSession, NuvioClient } from "#lib/nuvio/index.js";
import {
	type Container,
	DATABASE,
	LOGGER,
	NUVIO_TOKENS,
} from "#lib/services/index.js";
import { UserDataEvents } from "./events.ts";
import { NuvioSync } from "./nuvio-sync.ts";
import { UserDataStore } from "./store.ts";
import { NUVIO_SYNC, USER_DATA_EVENTS, USER_DATA_STORE } from "./tokens.ts";
import type { ProfileData } from "./types.ts";

/** Registers the user-data singletons on the server's root container. */
export function registerUserDataServices(container: Container): Container {
	return container
		.register(USER_DATA_EVENTS, () => new UserDataEvents())
		.register(
			USER_DATA_STORE,
			(c) => new UserDataStore(c.get(DATABASE), c.get(USER_DATA_EVENTS)),
		)
		.register(
			NUVIO_SYNC,
			(c) =>
				new NuvioSync(
					c.get(USER_DATA_STORE),
					c.get(NUVIO_TOKENS),
					c.get(LOGGER).scoped("NuvioSync"),
					{
						// The client only reads the access token off its session.
						clientFor: (accessToken) =>
							new NuvioClient({
								session: { access_token: accessToken } as AuthSession,
							}),
					},
				),
		);
}

/**
 * The signed-in profile's data for a page load, read from the local store.
 * The first read of a never-seen profile waits for its import from Nuvio;
 * after that nothing here touches the network. No session, no data.
 */
export function profileData(
	locals: App.Locals,
	fetch: typeof globalThis.fetch,
): ProfileData {
	const userId = locals.session?.user.id;
	const profileId = locals.profileId;
	if (userId === undefined || profileId == null) {
		const none = () => Promise.resolve([]);
		return { library: none, progress: none, history: none };
	}
	const store = locals.services.get(USER_DATA_STORE);
	let ready: Promise<boolean> | undefined;
	const read =
		<E extends "library" | "progress" | "history">(entity: E) =>
		async () => {
			ready ??= locals.services
				.get(NUVIO_SYNC)
				.ensureImported(userId, profileId, locals.nuvio.withFetch(fetch));
			await ready;
			return store.list(userId, profileId, entity);
		};
	return {
		library: read("library"),
		progress: read("progress"),
		history: read("history"),
	};
}
