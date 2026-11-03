/**
 * SRT / ASS → WebVTT conversion, done in the browser so an addon's subtitle
 * file never touches the server. `<track>` only accepts WebVTT; most addons hand
 * back SRT (or an already-WebVTT file, which passes through untouched).
 */

/** True when the text is already a WebVTT file (optionally BOM-prefixed). */
export function isWebVtt(text: string): boolean {
	return text.replace(/^﻿/, "").trimStart().startsWith("WEBVTT");
}

export function isAss(text: string): boolean {
	return /^\s*\[(script info|events)\]\s*$/im.test(text);
}

// A UTF-16 BOM picks that encoding; otherwise strict UTF-8, else the Windows-1252 most legacy SRTs are in.
export function decodeSubtitle(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		return new TextDecoder("utf-16le").decode(bytes);
	}
	if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		return new TextDecoder("utf-16be").decode(bytes);
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return new TextDecoder("windows-1252").decode(bytes);
	}
}

/**
 * Convert an SRT body to WebVTT: strip the BOM, normalise newlines, and turn
 * `,` millisecond separators into `.`. Cue index lines and blank lines are
 * left as-is : WebVTT tolerates both. A file that's already WebVTT is returned
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

export function toVtt(input: string): string {
	return isAss(input) ? assToVtt(input) : srtToVtt(input);
}

const DEFAULT_ASS_FORMAT = [
	"layer",
	"start",
	"end",
	"style",
	"name",
	"marginl",
	"marginr",
	"marginv",
	"effect",
	"text",
];

function splitFields(line: string, count: number): string[] {
	const parts = line.split(",");
	return [...parts.slice(0, count - 1), parts.slice(count - 1).join(",")];
}

function assTime(value: string | undefined): number | null {
	const match = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/.exec(
		value?.trim() ?? "",
	);
	if (!match) {
		return null;
	}
	const [, hours, minutes, seconds, fraction = "0"] = match;
	return (
		Number(hours) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(`0.${fraction}`)
	);
}

export function vttTime(seconds: number): string {
	const milliseconds = Math.max(0, Math.round(seconds * 1000));
	const pad = (value: number, length = 2) =>
		String(value).padStart(length, "0");
	return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1000) % 60)}.${pad(milliseconds % 1000, 3)}`;
}

// Override tags dropped, line breaks kept, and the rest escaped as WebVTT cue text.
export function assText(raw: string): string {
	if (/\{[^}]*\\p[1-9]/.test(raw)) {
		return "";
	}
	return raw
		.replace(/\{[^}]*\}/g, "")
		.replace(/\\[Nn]/g, "\n")
		.replace(/\\h/g, " ")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join("\n");
}

export function assToVtt(input: string): string {
	let format = DEFAULT_ASS_FORMAT;
	let inEvents = false;
	const cues: { start: number; end: number; text: string }[] = [];
	for (const line of input.replace(/^﻿/, "").split(/\r?\n/)) {
		const section = /^\s*\[(.+)\]\s*$/.exec(line);
		if (section) {
			inEvents = section[1].trim().toLowerCase() === "events";
			continue;
		}
		const colon = line.indexOf(":");
		if (!inEvents || colon === -1) {
			continue;
		}
		const kind = line.slice(0, colon).trim().toLowerCase();
		const rest = line.slice(colon + 1);
		if (kind === "format") {
			format = rest.split(",").map((field) => field.trim().toLowerCase());
			continue;
		}
		if (kind !== "dialogue") {
			continue;
		}
		const values = splitFields(rest, format.length);
		const start = assTime(values[format.indexOf("start")]);
		const end = assTime(values[format.indexOf("end")]);
		const text = assText(values[format.indexOf("text")] ?? "");
		if (start !== null && end !== null && end > start && text) {
			cues.push({ start, end, text });
		}
	}
	cues.sort((first, second) => first.start - second.start);
	const body = cues
		.map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text}`)
		.join("\n\n");
	return `WEBVTT\n\n${body}\n`;
}

export function delayLabel(offset: number): string {
	return `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`;
}

/** A WebVTT `blob:` URL for `<track src>`, from raw SRT/ASS/VTT text. */
export function vttBlobUrl(raw: string): string {
	return URL.createObjectURL(new Blob([toVtt(raw)], { type: "text/vtt" }));
}
