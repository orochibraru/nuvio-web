/**
 * Small pure helpers for the video player : kept out of the component so they
 * can be unit-tested and don't count against its size budget.
 */
import { languageKey } from "./audio-language.ts";

/** `h:mm:ss` (or `m:ss` under an hour). Non-finite input → `"0:00"`. */
export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) {
		return "0:00";
	}
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return h > 0
		? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
		: `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Human name for a subtitle language code (`en`, `eng`, `ger` → `English`,
 * `German`), region dropped so tracks group by language; or the code
 * upper-cased.
 */
export function languageName(code: string, locale = "en"): string {
	const raw = code.trim();
	const key = languageKey(raw);
	if (!key) {
		return raw.toUpperCase();
	}
	try {
		const resolved = new Intl.DisplayNames([locale], { type: "language" }).of(
			key,
		);
		if (resolved && resolved.toLowerCase() !== key) {
			return resolved;
		}
	} catch {
		// Intl.DisplayNames unsupported : fall through.
	}
	return raw.toUpperCase();
}

/** Fuzzy language-code match: `en` ~ `eng` ~ `en-US`, `de` ~ `ger` ~ `deu`. */
export function languageMatches(a: string, b: string): boolean {
	const ka = languageKey(a);
	const kb = languageKey(b);
	if (ka && kb) {
		return ka === kb;
	}
	const x = a.trim().toLowerCase().slice(0, 3);
	const y = b.trim().toLowerCase().slice(0, 3);
	return x.length > 0 && (x.startsWith(y) || y.startsWith(x));
}
