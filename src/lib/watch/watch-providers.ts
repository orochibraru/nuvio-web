/**
 * "Where to watch officially" : JustWatch's keyless GraphQL API. Factual
 * availability metadata; the links send viewers to the paid source, so this is
 * pro-rights (same footing as the cast / TheIntroDB lookups).
 */

export const JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql";
export const JUSTWATCH_IMAGES = "https://images.justwatch.com";
export const JUSTWATCH_WEB = "https://www.justwatch.com";

export type OfferKind = "stream" | "free" | "ads" | "rent" | "buy";

export interface WatchOffer {
	provider: string;
	technicalName: string;
	kind: OfferKind;
	url: string;
	icon: string | null;
}

export interface WatchProviders {
	/** Primary subscription provider : the hero "on Prime Video" badge. */
	network: string | null;
	/** Subscription / free / ad-supported streaming, deduped by provider. */
	stream: WatchOffer[];
	rent: WatchOffer[];
	buy: WatchOffer[];
	/** The JustWatch page for this title, if resolved. */
	justWatchUrl: string | null;
}

export const EMPTY_PROVIDERS: WatchProviders = {
	network: null,
	stream: [],
	rent: [],
	buy: [],
	justWatchUrl: null,
};

/** `en-US,en;q=0.9` → `US`. Falls back to the given default. */
export function regionFromAcceptLanguage(
	header: string | null,
	fallback = "US",
): string {
	const match = /[a-z]{2,3}-([A-Z]{2})/.exec(header ?? "");
	return match ? match[1] : fallback;
}

const KIND_BY_MONETIZATION: Record<string, OfferKind> = {
	FLATRATE: "stream",
	FLATRATE_AND_BUY: "stream",
	FREE: "free",
	ADS: "ads",
	RENT: "rent",
	BUY: "buy",
};

interface JwPackage {
	clearName?: string;
	technicalName?: string;
	icon?: string;
}
interface JwOffer {
	monetizationType?: string;
	standardWebURL?: string;
	package?: JwPackage;
}
interface JwContent {
	title?: string;
	originalReleaseYear?: number;
	fullPath?: string;
	externalIds?: { imdbId?: string | null } | null;
}
export interface JwNode {
	content?: JwContent;
	offers?: JwOffer[] | null;
}

export const SEARCH_QUERY = `
query NuvioWatchProviders($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        ... on MovieOrShow {
          content(country: $country, language: $language) {
            title
            originalReleaseYear
            fullPath
            externalIds { imdbId }
          }
          offers(country: $country, platform: WEB) {
            monetizationType
            standardWebURL
            package { clearName technicalName icon }
          }
        }
      }
    }
  }
}`.trim();

export function searchBody(title: string, country: string, first = 5): string {
	return JSON.stringify({
		query: SEARCH_QUERY,
		variables: {
			country,
			language: "en",
			first,
			filter: { searchQuery: title },
		},
	});
}

function iconUrl(raw: string | undefined): string | null {
	if (!raw) {
		return null;
	}
	// JustWatch icons come as `/icon/<id>/{profile}/{format}` templates.
	const path = raw
		.replace("{profile}", "s100")
		.replace("{format}", "webp")
		.replace(/\/$/, "");
	return path.startsWith("http") ? path : `${JUSTWATCH_IMAGES}${path}`;
}

/** Pick the node that matches our title, preferring an IMDb-id hit then year. */
export function pickNode(
	nodes: JwNode[],
	opts: { imdbId?: string | null; title: string; year?: number | null },
): JwNode | null {
	if (nodes.length === 0) {
		return null;
	}
	if (opts.imdbId) {
		const byId = nodes.find(
			(node) => node.content?.externalIds?.imdbId === opts.imdbId,
		);
		if (byId) {
			return byId;
		}
	}
	const wantedTitle = opts.title.trim().toLowerCase();
	const titleMatches = nodes.filter(
		(node) => node.content?.title?.trim().toLowerCase() === wantedTitle,
	);
	if (opts.year != null) {
		const byYear = titleMatches.find(
			(node) => node.content?.originalReleaseYear === opts.year,
		);
		if (byYear) {
			return byYear;
		}
	}
	return titleMatches[0] ?? (opts.imdbId ? null : nodes[0]);
}

const STREAM_KINDS = new Set<OfferKind>(["stream", "free", "ads"]);

/** Collapse "X with Ads" / "X Free with Ads" into the base "X"; drop exact dupes. */
function dedupeByProvider(offers: WatchOffer[]): WatchOffer[] {
	const out: WatchOffer[] = [];
	for (const offer of offers) {
		const clash = out.some(
			(kept) =>
				offer.provider.startsWith(kept.provider) ||
				kept.provider.startsWith(offer.provider),
		);
		if (!clash) {
			out.push(offer);
		}
	}
	return out;
}

/** Shape one JustWatch node into `WatchProviders`. */
export function shapeProviders(node: JwNode | null): WatchProviders {
	if (!node) {
		return EMPTY_PROVIDERS;
	}
	const streamOffers: WatchOffer[] = [];
	const rentOffers: WatchOffer[] = [];
	const buyOffers: WatchOffer[] = [];
	for (const offer of node.offers ?? []) {
		const kind = KIND_BY_MONETIZATION[offer.monetizationType ?? ""];
		const name = offer.package?.clearName;
		const url = offer.standardWebURL;
		if (!(kind && name && url)) {
			continue;
		}
		const shaped: WatchOffer = {
			provider: name,
			technicalName: offer.package?.technicalName ?? "",
			kind,
			url,
			icon: iconUrl(offer.package?.icon),
		};
		if (STREAM_KINDS.has(kind)) {
			streamOffers.push(shaped);
		} else if (kind === "rent") {
			rentOffers.push(shaped);
		} else {
			buyOffers.push(shaped);
		}
	}
	const stream = dedupeByProvider(streamOffers);
	const fullPath = node.content?.fullPath;
	return {
		network: stream[0]?.provider ?? null,
		stream,
		rent: dedupeByProvider(rentOffers),
		buy: dedupeByProvider(buyOffers),
		justWatchUrl: fullPath ? `${JUSTWATCH_WEB}${fullPath}` : null,
	};
}
