import * as v from "valibot";

export const PLATFORM = "web";
export const UI_VERSION = 1;

export const ACCENTS = [
	"blue",
	"violet",
	"green",
	"rose",
	"amber",
	"cyan",
	"neutral",
] as const;
export type Accent = (typeof ACCENTS)[number];

export const SUBTITLE_SIZES = ["small", "medium", "large"] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

/** Subtitle colour swatches : shared by Settings and the in-player panel. */
export const SUBTITLE_COLORS = [
	"#ffffff",
	"#ffe14d",
	"#7fd4ff",
	"#9dffb0",
	"#ff9db1",
] as const;

/** Preferred stream resolution for auto-pick on the player. `auto` = addon order. */
export const STREAM_QUALITIES = [
	"auto",
	"4K",
	"1080p",
	"720p",
	"480p",
] as const;
export type StreamQuality = (typeof STREAM_QUALITIES)[number];

/**
 * Where library / watch-progress data is read from and written to. Nuvio mobile
 * lets these be set independently. Only `nuvio` works today : `trakt` / `simkl`
 * need their own OAuth integration (Phase 5c); the API does not proxy them.
 */
export const SYNC_SOURCES = ["nuvio", "trakt", "simkl"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

/** Regions the "where to watch" (JustWatch) lookup supports in the settings UI. */
export const WATCH_REGIONS = [
	["auto", "Detect from browser"],
	["US", "United States"],
	["GB", "United Kingdom"],
	["CA", "Canada"],
	["AU", "Australia"],
	["IE", "Ireland"],
	["FR", "France"],
	["DE", "Germany"],
	["ES", "Spain"],
	["IT", "Italy"],
	["NL", "Netherlands"],
	["BR", "Brazil"],
	["MX", "Mexico"],
	["IN", "India"],
	["JP", "Japan"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

const WATCH_REGION_CODES = [
	"auto",
	"US",
	"GB",
	"CA",
	"AU",
	"IE",
	"FR",
	"DE",
	"ES",
	"IT",
	"NL",
	"BR",
	"MX",
	"IN",
	"JP",
] as const;
export type WatchRegion = (typeof WATCH_REGION_CODES)[number];

export const uiSettingsSchema = v.object({
	mode: v.fallback(v.picklist(["light", "dark", "system"]), "system"),
	darkStyle: v.fallback(v.picklist(["dim", "amoled"]), "dim"),
	accent: v.fallback(v.picklist(ACCENTS), "blue"),
	autoPlayNext: v.fallback(v.boolean(), true),
	/** Resolution the player auto-picks from a source list; "auto" = addon order. */
	preferredQuality: v.fallback(v.picklist(STREAM_QUALITIES), "auto"),
	subtitleSize: v.fallback(v.picklist(SUBTITLE_SIZES), "medium"),
	/** CSS colour for subtitle text. */
	subtitleColor: v.fallback(v.string(), "#ffffff"),
	/** Semi-opaque black plate behind the text. */
	subtitleBackground: v.fallback(v.boolean(), true),
	/** ISO-ish language code auto-selected when a stream has matching subs; "" = off. */
	subtitleLanguage: v.fallback(v.string(), ""),
	/** Country for the "where to watch" lookup; "auto" = derive from the browser. */
	watchRegion: v.fallback(v.picklist(WATCH_REGION_CODES), "auto"),
	/** Backend the library is read from / written to. */
	librarySource: v.fallback(v.picklist(SYNC_SOURCES), "nuvio"),
	/** Backend watch progress + history are read from / written to. */
	progressSource: v.fallback(v.picklist(SYNC_SOURCES), "nuvio"),
	/** Re-open the same title with the last stream URL instead of re-resolving —
	 *  handy for debrid addons where re-resolution is slow. */
	reuseLastLink: v.fallback(v.boolean(), false),
	/** How long a remembered stream URL stays valid, in days (debrid links
	 *  expire : 3 days matches most providers). */
	linkCacheDays: v.fallback(
		v.pipe(v.number(), v.minValue(1), v.maxValue(30)),
		3,
	),
	/** Personal TheIntroDB API key (https://theintrodb.org) : optional, folds
	 *  the owner's own pending submissions into the skip-intro/outro lookup and
	 *  raises their rate/usage limits. The public keyless tier works without it. */
	introDbApiKey: v.fallback(v.string(), ""),
});

export type UiSettings = v.InferOutput<typeof uiSettingsSchema>;

export const DEFAULT_UI_SETTINGS: UiSettings = {
	mode: "system",
	darkStyle: "dim",
	accent: "blue",
	autoPlayNext: true,
	preferredQuality: "auto",
	subtitleSize: "medium",
	subtitleColor: "#ffffff",
	subtitleBackground: true,
	subtitleLanguage: "",
	watchRegion: "auto",
	librarySource: "nuvio",
	progressSource: "nuvio",
	reuseLastLink: false,
	linkCacheDays: 3,
	introDbApiKey: "",
};

/** `font-size` for the `::cue` pseudo-element, as a share of the video height. */
export function subtitleFontSize(size: SubtitleSize): string {
	return size === "small" ? "3.2vh" : size === "large" ? "6vh" : "4.4vh";
}
