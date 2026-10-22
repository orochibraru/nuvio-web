import { languageKey } from "./audio-language.ts";
import type { SubtitleOption } from "./types.ts";

export interface SubtitleGroup {
	/** The language's display name, which is what the tracks are grouped by. */
	name: string;
	options: SubtitleOption[];
}

/**
 * The picker's tracks grouped by language: the viewer's preferred language
 * first, then the rest alphabetically. Addon order is kept inside a group, so
 * the first row of a language is the one its addon ranked best.
 */
export function groupSubtitles(
	options: readonly SubtitleOption[],
	preferredLanguage: string,
	locale = "en",
): SubtitleGroup[] {
	const groups = new Map<string, SubtitleGroup>();
	for (const option of options) {
		const group = groups.get(option.name);
		if (group) {
			group.options.push(option);
		} else {
			groups.set(option.name, { name: option.name, options: [option] });
		}
	}
	const wanted = languageKey(preferredLanguage);
	const preferred = (group: SubtitleGroup) =>
		wanted !== null && languageKey(group.options[0].lang) === wanted;
	return [...groups.values()].sort(
		(a, b) =>
			Number(preferred(b)) - Number(preferred(a)) ||
			a.name.localeCompare(b.name, locale),
	);
}
