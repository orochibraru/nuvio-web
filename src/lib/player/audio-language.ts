/**
 * Which audio track a viewer wants, by language. Pure : the settings decide the
 * preference, the player applies it to whatever track list a source exposes.
 */

// ISO 639-2 bibliographic codes `Intl.Locale` doesn't canonicalise everywhere.
const BIBLIOGRAPHIC: Record<string, string> = {
	alb: "sq",
	arm: "hy",
	baq: "eu",
	bur: "my",
	chi: "zh",
	cze: "cs",
	dut: "nl",
	fre: "fr",
	geo: "ka",
	ger: "de",
	gre: "el",
	ice: "is",
	mac: "mk",
	may: "ms",
	per: "fa",
	rum: "ro",
	slo: "sk",
	tib: "bo",
	wel: "cy",
};

/**
 * A comparable key for a language code in any of the spellings tracks and
 * settings use (`fr`, `fra`, `fre`, `fr-CA`), or null when it names none.
 */
export function languageKey(code: string | null | undefined): string | null {
	const raw = code?.trim().toLowerCase().replace("_", "-");
	if (!raw || raw === "und") {
		return null;
	}
	const primary = raw.split("-")[0];
	if (BIBLIOGRAPHIC[primary]) {
		return BIBLIOGRAPHIC[primary];
	}
	try {
		return new Intl.Locale(primary).language;
	} catch {
		return null;
	}
}

/** The mobile app's non-language choices, stored in the same field. */
const FILE_DEFAULT = "default";
const DEVICE = "device";
export const ORIGINAL = "original";

/**
 * Language keys to look for, best first. `preference` is a language code,
 * `device` (the browser's languages), `original` (the track the file flags as
 * the original language), or `default` / empty, which leave the file's own
 * default alone. `secondary` is tried after whatever the preference gave.
 */
export function audioLanguageTargets(
	preference: string | null | undefined,
	secondary: string | null | undefined,
	deviceLanguages: readonly string[],
): string[] {
	const choice = preference?.trim().toLowerCase() ?? "";
	const wanted =
		choice === DEVICE
			? deviceLanguages
			: choice === "" || choice === FILE_DEFAULT || choice === ORIGINAL
				? []
				: [choice];
	const fallback = secondary?.trim().toLowerCase();
	const keys = [
		...wanted,
		...(fallback && ![FILE_DEFAULT, DEVICE, ORIGINAL].includes(fallback)
			? [fallback]
			: []),
	]
		.map(languageKey)
		.filter((key) => key !== null);
	return [...new Set(choice === ORIGINAL ? [ORIGINAL, ...keys] : keys)];
}

/** Index of the first track in the best-ranked wanted language, or -1. */
export function preferredTrackIndex(
	tracks: ReadonlyArray<{ language: string; original?: boolean }>,
	targets: readonly string[],
): number {
	for (const target of targets) {
		const index = tracks.findIndex((track) =>
			target === ORIGINAL
				? track.original === true
				: languageKey(track.language) === target,
		);
		if (index !== -1) {
			return index;
		}
	}
	return -1;
}

// A label that is only a language tag : `fr`, `fre`, `pt-BR`, `en_US`.
const BARE_CODE = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;

/**
 * An audio track's label as a viewer reads it : a bare language code becomes
 * that language's name in `locale` (`fr` → `Français` under `fr`, `English`
 * under `en`; `pt-BR` keeps its region). Anything else (`VF`, `English 5.1`,
 * the numbered fallback) is the source's own wording and stays as it is.
 */
export function audioTrackName(label: string, locale: string): string {
	const raw = label.trim().replace("_", "-");
	const key = BARE_CODE.test(raw) ? languageKey(raw) : null;
	if (!key) {
		return label;
	}
	const region = raw.split("-").slice(1);
	for (const tag of region.length > 0
		? [[key, ...region].join("-"), key]
		: [key]) {
		try {
			const name = new Intl.DisplayNames([locale], {
				type: "language",
				fallback: "none",
			}).of(tag);
			if (name) {
				return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
			}
		} catch {
			// A malformed tag : try the bare language, then give up.
		}
	}
	return label;
}
