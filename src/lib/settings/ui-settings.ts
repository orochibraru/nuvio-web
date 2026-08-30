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

/**
 * Where library / watch-progress data is read from and written to. Nuvio mobile
 * lets these be set independently. Only `nuvio` works today — `trakt` / `simkl`
 * need their own OAuth integration (Phase 5c); the API does not proxy them.
 */
export const SYNC_SOURCES = ["nuvio", "trakt", "simkl"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export const uiSettingsSchema = v.object({
	mode: v.fallback(v.picklist(["light", "dark", "system"]), "system"),
	darkStyle: v.fallback(v.picklist(["dim", "amoled"]), "dim"),
	accent: v.fallback(v.picklist(ACCENTS), "blue"),
	autoPlayNext: v.fallback(v.boolean(), true),
	subtitleSize: v.fallback(v.picklist(SUBTITLE_SIZES), "medium"),
	/** CSS colour for subtitle text. */
	subtitleColor: v.fallback(v.string(), "#ffffff"),
	/** Semi-opaque black plate behind the text. */
	subtitleBackground: v.fallback(v.boolean(), true),
	/** ISO-ish language code auto-selected when a stream has matching subs; "" = off. */
	subtitleLanguage: v.fallback(v.string(), ""),
	/** Backend the library is read from / written to. */
	librarySource: v.fallback(v.picklist(SYNC_SOURCES), "nuvio"),
	/** Backend watch progress + history are read from / written to. */
	progressSource: v.fallback(v.picklist(SYNC_SOURCES), "nuvio"),
});

export type UiSettings = v.InferOutput<typeof uiSettingsSchema>;

export const DEFAULT_UI_SETTINGS: UiSettings = {
	mode: "system",
	darkStyle: "dim",
	accent: "blue",
	autoPlayNext: true,
	subtitleSize: "medium",
	subtitleColor: "#ffffff",
	subtitleBackground: true,
	subtitleLanguage: "",
	librarySource: "nuvio",
	progressSource: "nuvio",
};

/** `font-size` for the `::cue` pseudo-element, as a share of the video height. */
export function subtitleFontSize(size: SubtitleSize): string {
	return size === "small" ? "3.2vh" : size === "large" ? "6vh" : "4.4vh";
}
