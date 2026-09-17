import { browser } from "$app/env";

/**
 * Recent search terms, kept in `localStorage` only : never synced. Most-recent
 * first, deduped, capped. All storage access is guarded (private windows /
 * blocked site data throw).
 *
 * Scoped per owner (`<userId>:<profileId>`, see `syncOwner`) rather than
 * global: a shared browser or a second profile would otherwise be shown
 * someone else's searches, and the search page turns a recent term into a
 * one-click query.
 */
/** The bare prefix is also the unscoped key earlier versions wrote. */
const KEY_PREFIX = "nuvio:recent-searches";
const LIMIT = 12;

function keyFor(owner: string): string {
	return `${KEY_PREFIX}:${owner}`;
}

function load(owner: string | null): string[] {
	if (!(browser && owner)) {
		return [];
	}
	try {
		const raw = localStorage.getItem(keyFor(owner));
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((entry): entry is string => typeof entry === "string")
			: [];
	} catch {
		return [];
	}
}

/**
 * Drops the unscoped key written by earlier versions, plus every other owner's.
 * Runs on attach, so signing in as someone else leaves nothing of the previous
 * account behind. `null` keeps nothing, which is the sign-out case.
 */
function purgeOtherOwners(keep: string | null): void {
	if (!browser) {
		return;
	}
	try {
		const mine = keep === null ? null : keyFor(keep);
		for (const key of Object.keys(localStorage)) {
			const isOurs = key === KEY_PREFIX || key.startsWith(`${KEY_PREFIX}:`);
			if (isOurs && key !== mine) {
				localStorage.removeItem(key);
			}
		}
	} catch {
		// no-op : storage unavailable
	}
}

class SearchHistory {
	#owner: string | null = null;
	#entries = $state<string[]>([]);

	get entries(): string[] {
		return this.#entries;
	}

	/** Point the history at one profile of one account. Idempotent. */
	attach(owner: string) {
		if (this.#owner === owner) {
			return;
		}
		this.#owner = owner;
		purgeOtherOwners(owner);
		this.#entries = load(owner);
	}

	/** Wipe every owner's history and detach. For sign-out. */
	forget() {
		this.#owner = null;
		this.#entries = [];
		purgeOtherOwners(null);
	}

	#persist() {
		if (!(browser && this.#owner)) {
			return;
		}
		try {
			localStorage.setItem(keyFor(this.#owner), JSON.stringify(this.#entries));
		} catch {
			// no-op : storage unavailable
		}
	}

	record(query: string) {
		const value = query.trim();
		if (!value) {
			return;
		}
		const next = [
			value,
			...this.#entries.filter(
				(entry) => entry.toLowerCase() !== value.toLowerCase(),
			),
		].slice(0, LIMIT);
		this.#entries = next;
		this.#persist();
	}

	remove(query: string) {
		this.#entries = this.#entries.filter((entry) => entry !== query);
		this.#persist();
	}

	clear() {
		this.#entries = [];
		this.#persist();
	}
}

export const searchHistory = new SearchHistory();
