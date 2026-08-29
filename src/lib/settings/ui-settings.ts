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

export const uiSettingsSchema = v.object({
	mode: v.fallback(v.picklist(["light", "dark", "system"]), "system"),
	darkStyle: v.fallback(v.picklist(["dim", "amoled"]), "dim"),
	accent: v.fallback(v.picklist(ACCENTS), "blue"),
});

export type UiSettings = v.InferOutput<typeof uiSettingsSchema>;

export const DEFAULT_UI_SETTINGS: UiSettings = {
	mode: "system",
	darkStyle: "dim",
	accent: "blue",
};
