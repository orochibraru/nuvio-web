// Stremio addon protocol : the subset Nuvio web consumes.
// Reference: https://github.com/Stremio/stremio-addon-sdk/tree/master/docs/api

export type ContentType = "movie" | "series" | (string & {});
export type PosterShape = "poster" | "landscape" | "square";
export type AddonResourceName =
	| "catalog"
	| "meta"
	| "stream"
	| "subtitles"
	| "addon_catalog";

export interface AddonResourceObject {
	name: AddonResourceName;
	types: string[];
	idPrefixes?: string[];
}

export interface CatalogExtraDef {
	name: string;
	isRequired?: boolean;
	options?: string[];
	optionsLimit?: number;
}

export interface CatalogDef {
	type: string;
	id: string;
	name?: string;
	extra?: CatalogExtraDef[];
	extraSupported?: string[];
	extraRequired?: string[];
	genres?: string[];
}

export interface AddonManifest {
	id: string;
	version: string;
	name: string;
	description?: string;
	logo?: string;
	background?: string;
	contactEmail?: string;
	types: string[];
	idPrefixes?: string[];
	resources: Array<AddonResourceName | AddonResourceObject>;
	catalogs: CatalogDef[];
	addonCatalogs?: CatalogDef[];
	behaviorHints?: {
		adult?: boolean;
		p2p?: boolean;
		configurable?: boolean;
		configurationRequired?: boolean;
	};
}

export interface MetaPreview {
	id: string;
	type: string;
	name: string;
	poster?: string;
	posterShape?: PosterShape;
	background?: string;
	logo?: string;
	description?: string;
	releaseInfo?: string;
	imdbRating?: string | number;
	genres?: string[];
	links?: MetaLink[];
}

export interface MetaLink {
	name: string;
	category: string;
	url: string;
}

export interface MetaVideo {
	id: string;
	title: string;
	released?: string;
	season?: number;
	episode?: number;
	thumbnail?: string;
	overview?: string;
	rating?: string;
	streams?: Stream[];
}

export interface Meta extends MetaPreview {
	runtime?: string;
	released?: string;
	country?: string;
	cast?: string[];
	director?: string[];
	writer?: string[];
	awards?: string;
	/** Age rating / content certification when an addon provides one (e.g. "PG-13"). */
	certification?: string;
	/** Series production status when an addon provides one (e.g. "Ended", "Continuing"). */
	status?: string;
	videos?: MetaVideo[];
	trailerStreams?: Array<{ title?: string; ytId: string }>;
	behaviorHints?: {
		defaultVideoId?: string;
		hasScheduledVideos?: boolean;
		adult?: boolean;
	};
}

export interface Stream {
	url?: string;
	ytId?: string;
	infoHash?: string;
	fileIdx?: number;
	externalUrl?: string;
	name?: string;
	description?: string;
	/** Deprecated alias for `description`; still emitted by many addons. */
	title?: string;
	subtitles?: Subtitle[];
	sources?: string[];
	behaviorHints?: {
		notWebReady?: boolean;
		bingeGroup?: string;
		filename?: string;
		videoHash?: string;
		videoSize?: number;
		proxyHeaders?: {
			request?: Record<string, string>;
			response?: Record<string, string>;
		};
	};
}

export interface Subtitle {
	id: string;
	url: string;
	lang: string;
}

/** `key=value` pairs appended to a resource path before `.json`. */
export type ResourceExtra = Record<string, string | number | undefined>;

export interface CatalogQuery {
	type: string;
	id: string;
	search?: string;
	genre?: string;
	skip?: number;
}

export interface AddonError {
	addonUrl: string;
	addonName: string;
	resource: AddonResourceName;
	message: string;
}
