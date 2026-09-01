/**
 * SRT → WebVTT conversion, done in the browser so an addon's subtitle file
 * never touches the server. `<track>` only accepts WebVTT; most addons hand
 * back SRT (or an already-WebVTT file, which passes through untouched).
 */

/** True when the text is already a WebVTT file (optionally BOM-prefixed). */
export function isWebVtt(text: string): boolean {
	return text.replace(/^﻿/, "").trimStart().startsWith("WEBVTT");
}

/**
 * Convert an SRT body to WebVTT: strip the BOM, normalise newlines, and turn
 * `,` millisecond separators into `.`. Cue index lines and blank lines are
 * left as-is — WebVTT tolerates both. A file that's already WebVTT is returned
 * unchanged.
 */
export function srtToVtt(input: string): string {
	if (isWebVtt(input)) {
		return input.replace(/^﻿/, "");
	}
	const body = input
		.replace(/^﻿/, "")
		.replace(/\r+/g, "")
		.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
	return `WEBVTT\n\n${body}`;
}

/** A WebVTT `blob:` URL for `<track src>`, from raw SRT/VTT text. */
export function vttBlobUrl(raw: string): string {
	return URL.createObjectURL(new Blob([srtToVtt(raw)], { type: "text/vtt" }));
}
