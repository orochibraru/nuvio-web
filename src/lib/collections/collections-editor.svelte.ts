import type { Collection } from "#lib/nuvio/index.js";
import { refreshAll } from "$app/navigation";
import { saveCollections } from "./collections.remote.ts";

/**
 * How long a saved list outranks the server's copy. The API's reads lag its
 * writes (the sync store's `RECENTLY_FLUSHED_GRACE_MS` exists for the same
 * reason), so a pull straight after a push can still return the old blob.
 */
const GRACE_MS = 15_000;
const CATCH_UP_TRIES = 6;
const CATCH_UP_DELAY_MS = 600;

/** Key-order-independent JSON, so the server's copy compares equal to ours. */
function stable(value: unknown): string {
	return JSON.stringify(value, (_key, entry: unknown) =>
		entry && typeof entry === "object" && !Array.isArray(entry)
			? Object.fromEntries(
					Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
						a.localeCompare(b),
					),
				)
			: entry,
	);
}

/**
 * The profile's collections, as the collection pages edit them.
 *
 * The API's push is a **full replace**, and its reads lag its writes. Building
 * each edit from the page's last pull therefore does two wrong things: the
 * page shows the pre-edit list after saving, and a second edit made before the
 * pull catches up is computed from that stale list and pushed over the first
 * one, deleting it server-side. So:
 *
 * - `current` is the list just saved until the server's copy matches it (or
 *   the grace period runs out), and every edit is built from `current`;
 * - `save` re-pulls until the server agrees, so the load's other data (a new
 *   folder's titles) catches up without a manual reload.
 */
export class CollectionsEditor {
	readonly #server: () => Collection[];
	#pending = $state<{ list: Collection[]; key: string; at: number } | null>(
		null,
	);
	saving = $state(false);

	/** @param server the collections the page's load last pulled. */
	constructor(server: () => Collection[]) {
		this.#server = server;
	}

	get current(): Collection[] {
		const server = this.#server();
		const pending = this.#pending;
		if (
			!pending ||
			Date.now() - pending.at > GRACE_MS ||
			stable($state.snapshot(server)) === pending.key
		) {
			return server;
		}
		return pending.list;
	}

	/**
	 * Saves `next` as the whole list. `false` (and nothing kept) on failure.
	 *
	 * `refresh: false` skips re-pulling the load: for a page that shows
	 * `current` and fetches what else it needs itself, where a load re-run buys
	 * nothing but a round trip.
	 */
	async save(
		next: Collection[],
		{ refresh = true }: { refresh?: boolean } = {},
	): Promise<boolean> {
		const list = $state.snapshot(next) as Collection[];
		const key = stable(list);
		const previous = this.#pending;
		this.#pending = { list, key, at: Date.now() };
		this.saving = true;
		try {
			await saveCollections(list);
		} catch {
			this.#pending = previous;
			this.saving = false;
			return false;
		}
		if (!refresh) {
			this.saving = false;
			return true;
		}
		try {
			for (let attempt = 0; attempt < CATCH_UP_TRIES; attempt++) {
				// biome-ignore lint/performance/noAwaitInLoops: each re-pull only makes sense after the previous one came back stale
				await refreshAll();
				if (stable($state.snapshot(this.#server())) === key) {
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, CATCH_UP_DELAY_MS));
			}
		} finally {
			this.saving = false;
		}
		return true;
	}
}
