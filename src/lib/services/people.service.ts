import type { RequestBudget } from "./request-budget.service.ts";

export interface Person {
	name: string;
	photo: string | null;
	bio: string | null;
	born: number | null;
}

const PERSON_HINT =
	/\b(actor|actress|filmmaker|director|producer|screenwriter|comedian|performer|singer|musician|model|voice)\b/i;

const REQUEST_TIMEOUT_MS = 6000;

interface WikipediaSummary {
	description?: string;
	extract?: string;
	thumbnail?: { source?: string };
	type?: string;
}

function stripTracking(url: string | null | undefined): string | null {
	if (!url) {
		return null;
	}
	try {
		const parsed = new URL(url);
		parsed.search = "";
		return parsed.toString();
	} catch {
		return url;
	}
}

/**
 * Cast and crew details from Wikipedia's public REST summary API. Fetched from
 * the browser (Wikipedia sends `Access-Control-Allow-Origin: *`), so no
 * third-party biography text ever transits our server.
 */
export class PeopleService {
	readonly #cache = new Map<string, Promise<Person>>();

	constructor(
		private readonly budget: RequestBudget,
		private readonly fetchImpl: typeof fetch = globalThis.fetch,
	) {}

	/** Memoised per name for the session. Never rejects : misses come back empty. */
	info(name: string): Promise<Person> {
		const key = name.trim();
		let entry = this.#cache.get(key);
		if (!entry) {
			entry = this.#fetchPerson(key);
			this.#cache.set(key, entry);
		}
		return entry;
	}

	async #fetchPerson(name: string): Promise<Person> {
		const empty: Person = { name, photo: null, bio: null, born: null };
		try {
			const response = await this.budget.run(() =>
				this.fetchImpl(
					`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`,
					{
						headers: { accept: "application/json" },
						signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
					},
				),
			);
			if (!response.ok) {
				return empty;
			}
			return PeopleService.#toPerson(
				name,
				(await response.json()) as WikipediaSummary,
			);
		} catch {
			return empty;
		}
	}

	static #toPerson(name: string, data: WikipediaSummary): Person {
		const description = data.description ?? "";
		const isPerson =
			data.type === "standard" &&
			(PERSON_HINT.test(description) || PERSON_HINT.test(data.extract ?? ""));

		const bornMatch =
			/born[^)]*?(\d{4})/i.exec(description) ??
			/\(born[^)]*?(\d{4})/i.exec(data.extract ?? "");

		return {
			name,
			photo: isPerson ? stripTracking(data.thumbnail?.source) : null,
			bio: isPerson ? (data.extract ?? null) : null,
			born: bornMatch ? Number(bornMatch[1]) : null,
		};
	}
}
