import { languageMatches } from "#lib/player/format.js";
import { localMediaUrl } from "./files.ts";
import type { DownloadRecord } from "./types.ts";

/**
 * The subtitles worth taking along: one per language (the first an addon
 * offers), the viewer's preferred language first, capped : each is a request,
 * and nobody switches between twelve languages on a plane.
 */
export function chooseSubtitles<T extends { lang: string }>(
	options: readonly T[],
	preferred: string,
	limit = 5,
): T[] {
	const ordered = [
		...options.filter((option) => languageMatches(option.lang, preferred)),
		...options.filter((option) => !languageMatches(option.lang, preferred)),
	];
	const seen = new Set<string>();
	return ordered
		.filter((option) => {
			const key = option.lang.toLowerCase();
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		})
		.slice(0, limit);
}

/** Subtitles taken along, in the shape the player's subtitle list takes. */
export function playbackSubtitles(record: DownloadRecord) {
	return record.subtitles.map((subtitle, index) => ({
		id: `download:${index}`,
		lang: subtitle.lang,
		url: localMediaUrl(record.id, `subs/${subtitle.file}`),
		addonName: "Downloaded",
		sdh: subtitle.sdh,
	}));
}
