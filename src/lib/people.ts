/**
 * Cast/crew details, sourced from Wikipedia's public REST summary API. Fetched
 * from the browser (Wikipedia sends `Access-Control-Allow-Origin: *`) so no
 * third-party biography text ever transits our server; results are memoised per
 * name for the session.
 */
export type Person = {
	name: string;
	photo: string | null;
	bio: string | null;
	born: number | null;
};

const cache = new Map<string, Promise<Person>>();

const PERSON_HINT =
	/\b(actor|actress|filmmaker|director|producer|screenwriter|comedian|performer|singer|musician|model|voice)\b/i;

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

async function fetchPerson(name: string): Promise<Person> {
	const empty: Person = { name, photo: null, bio: null, born: null };
	try {
		const response = await fetch(
			`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`,
			{
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(6000),
			},
		);
		if (!response.ok) {
			return empty;
		}
		const data = (await response.json()) as {
			description?: string;
			extract?: string;
			thumbnail?: { source?: string };
			type?: string;
		};

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
	} catch {
		return empty;
	}
}

export function personInfo(name: string): Promise<Person> {
	const key = name.trim();
	let entry = cache.get(key);
	if (!entry) {
		entry = fetchPerson(key);
		cache.set(key, entry);
	}
	return entry;
}
