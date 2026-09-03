import { browser } from "$app/env";

/**
 * Recent search terms, kept in `localStorage` only : never synced. Most-recent
 * first, deduped, capped. All storage access is guarded (private windows /
 * blocked site data throw).
 */
const KEY = "nuvio:recent-searches";
const LIMIT = 12;

function load(): string[] {
	if (!browser) {
		return [];
	}
	try {
		const raw = localStorage.getItem(KEY);
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

class SearchHistory {
	#entries = $state<string[]>(load());

	get entries(): string[] {
		return this.#entries;
	}

	#persist() {
		if (!browser) {
			return;
		}
		try {
			localStorage.setItem(KEY, JSON.stringify(this.#entries));
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
